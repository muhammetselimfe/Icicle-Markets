// CoinGecko API client for token market data.
//
// The public CoinGecko API allows only a handful of requests per minute per IP and answers
// over-limit calls with a 429 that carries no CORS headers (the browser reports it as a
// network error). This client keeps the app inside that budget:
//   - identical endpoints share one in-flight request and a 60 s response cache
//   - /simple/price calls from different hooks are coalesced into one request and served
//     from a per-coin price cache, so AVAX is fetched once no matter how many hooks ask
//   - after a 429 every call is held for Retry-After (default 60 s) and stale data is served
//   - a network failure gets a short hold-off as well: a direct browser call that is rate
//     limited surfaces as a CORS failure, not as a 429, and retrying it only makes it worse
//   - on Netlify the base URL points at the same-origin, CDN-cached proxy in
//     netlify/functions/coingecko.mts (set via VITE_COINGECKO_BASE in netlify.toml)

const DIRECT_BASE = 'https://api.coingecko.com/api/v3';

/**
 * Direct API unless VITE_COINGECKO_BASE says otherwise. Set it to `/api/coingecko` to use the
 * proxy: Netlify does this in netlify.toml, and `vite dev` / `vite preview` forward that path
 * upstream (see vite.config.ts) for anyone who wants the same locally.
 */
function resolveBaseUrl(): string {
  return import.meta.env.VITE_COINGECKO_BASE || DIRECT_BASE;
}

/** How long a response is reused without a network call. */
export const FRESH_MS = 60_000;
/** How long an expired response may still be served when the API is unavailable. */
export const STALE_MS = 10 * 60_000;
/** Hold-off after a 429 when the response carries no Retry-After header. */
export const DEFAULT_BACKOFF_MS = 60_000;
/** Hold-off after a network failure (offline, or a rate limit hidden behind a CORS error). */
export const NETWORK_BACKOFF_MS = 15_000;
/** Window in which concurrent /simple/price calls are merged into one request. */
export const BATCH_WINDOW_MS = 20;

/** Thrown while the client is holding off; React Query must not retry it (see main.tsx). */
export class CoinGeckoRateLimitError extends Error {
  readonly retryAfterMs: number;
  readonly reason: 'rate-limit' | 'network';

  constructor(retryAfterMs: number, reason: 'rate-limit' | 'network' = 'rate-limit') {
    const wait = `Try again in ${Math.ceil(retryAfterMs / 1000)}s.`;
    super(
      reason === 'network'
        ? `CoinGecko is unreachable (possibly rate limited). ${wait}`
        : `CoinGecko rate limit reached. ${wait}`,
    );
    this.name = 'CoinGeckoRateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.reason = reason;
  }
}

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
  sparkline_in_7d?: {
    price: number[];
  };
}

export interface SimplePrice {
  usd: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
}

export interface SimplePriceData {
  [coinId: string]: SimplePrice;
}

export interface CoinTicker {
  base: string;
  target: string;
  market: { name: string; identifier: string };
  converted_last: { usd: number };
  converted_volume: { usd: number };
  trust_score: string | null;
  trade_url: string | null;
  bid_ask_spread_percentage?: number;
}

export interface CoinInfo {
  id: string;
  description: { en: string };
  links: {
    homepage: string[];
    blockchain_site: string[];
    twitter_screen_name: string;
    subreddit_url: string;
    repos_url: { github: string[] };
  };
  categories: string[];
  market_data: { total_value_locked: { usd: number } | null };
  tickers: CoinTicker[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_BACKOFF_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), 1000);
  return DEFAULT_BACKOFF_MS;
}

export class CoinGeckoClient {
  private readonly baseUrl: string;
  private readonly now: () => number;

  private readonly responses = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private blockedUntil = 0;
  private blockedReason: 'rate-limit' | 'network' = 'rate-limit';

  /** `null` marks an id CoinGecko did not return, so it is not re-requested every call. */
  private readonly prices = new Map<string, CacheEntry<SimplePrice | null>>();
  /** Ids currently being fetched, with the batch request that carries them. */
  private readonly inflightPrices = new Map<string, Promise<void>>();
  private pendingPriceIds = new Set<string>();
  private pendingPriceBatch: Promise<void> | null = null;

  constructor(baseUrl: string = resolveBaseUrl(), now: () => number = Date.now) {
    this.baseUrl = baseUrl;
    this.now = now;
  }

  /** Milliseconds until requests are attempted again, 0 when not rate limited. */
  get backoffRemainingMs(): number {
    return Math.max(0, this.blockedUntil - this.now());
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const now = this.now();
    const cached = this.responses.get(endpoint) as CacheEntry<T> | undefined;
    if (cached && now - cached.timestamp < FRESH_MS) return cached.data;
    const stale = cached && now - cached.timestamp < STALE_MS ? cached.data : undefined;

    if (now < this.blockedUntil) {
      if (stale !== undefined) return stale;
      throw new CoinGeckoRateLimitError(this.blockedUntil - now, this.blockedReason);
    }

    const existing = this.inflight.get(endpoint) as Promise<T> | undefined;
    if (existing) return existing;

    const request = this.request<T>(endpoint, stale).finally(() => this.inflight.delete(endpoint));
    this.inflight.set(endpoint, request);
    return request;
  }

  private async request<T>(endpoint: string, stale: T | undefined): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, { headers: { accept: 'application/json' } });
    } catch {
      this.block(NETWORK_BACKOFF_MS, 'network');
      if (stale !== undefined) return stale;
      throw new CoinGeckoRateLimitError(NETWORK_BACKOFF_MS, 'network');
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
      this.block(retryAfterMs, 'rate-limit');
      if (stale !== undefined) return stale;
      throw new CoinGeckoRateLimitError(retryAfterMs);
    }

    if (!response.ok) {
      if (stale !== undefined) return stale;
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as T;
    this.responses.set(endpoint, { data, timestamp: this.now() });
    return data;
  }

  private block(ms: number, reason: 'rate-limit' | 'network'): void {
    const until = this.now() + ms;
    if (until > this.blockedUntil) {
      this.blockedUntil = until;
      this.blockedReason = reason;
    }
  }

  // ── Prices ────────────────────────────────────────────────────────────────

  /**
   * USD price, 24h change, market cap and 24h volume for the given coin ids.
   * Ids already in the price cache are not re-requested; the rest are merged with any
   * other call made in the same tick into a single /simple/price request.
   */
  async getSimplePrice(coinIds: string[]): Promise<SimplePriceData> {
    const ids = Array.from(new Set(coinIds));
    const now = this.now();
    const missing = ids.filter((id) => {
      const entry = this.prices.get(id);
      return !entry || now - entry.timestamp >= FRESH_MS;
    });

    if (missing.length > 0) {
      try {
        // Ids already on the wire ride the batch that carries them; the rest form a new batch.
        const waits = new Set<Promise<void>>();
        const fresh: string[] = [];
        for (const id of missing) {
          const inflight = this.inflightPrices.get(id);
          if (inflight) waits.add(inflight);
          else fresh.push(id);
        }
        if (fresh.length > 0) waits.add(this.fetchPrices(fresh));
        await Promise.all(waits);
      } catch (err) {
        // Serve stale prices if every requested id still has one; otherwise surface the error.
        const allStale = ids.every((id) => {
          const entry = this.prices.get(id);
          return entry && this.now() - entry.timestamp < STALE_MS;
        });
        if (!allStale) throw err;
      }
    }

    const out: SimplePriceData = {};
    for (const id of ids) {
      const entry = this.prices.get(id);
      if (entry?.data) out[id] = entry.data;
    }
    return out;
  }

  private fetchPrices(ids: string[]): Promise<void> {
    for (const id of ids) this.pendingPriceIds.add(id);

    if (!this.pendingPriceBatch) {
      const batchPromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const batch = Array.from(this.pendingPriceIds).sort();
          this.pendingPriceIds = new Set();
          this.pendingPriceBatch = null;

          const params = new URLSearchParams({
            ids: batch.join(','),
            vs_currencies: 'usd',
            include_market_cap: 'true',
            include_24hr_vol: 'true',
            include_24hr_change: 'true',
          });

          this.fetch<SimplePriceData>(`/simple/price?${params}`)
            .then((data) => {
              const timestamp = this.now();
              for (const id of batch) {
                this.prices.set(id, { data: data[id] ?? null, timestamp });
              }
              resolve();
            }, reject)
            .finally(() => {
              for (const id of batch) {
                if (this.inflightPrices.get(id) === batchPromise) this.inflightPrices.delete(id);
              }
            });
        }, BATCH_WINDOW_MS);
      });
      this.pendingPriceBatch = batchPromise;
    }

    const batchPromise = this.pendingPriceBatch;
    for (const id of ids) this.inflightPrices.set(id, batchPromise);
    return batchPromise;
  }

  async getAvaxPrice(): Promise<{
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
  }> {
    const data = await this.getSimplePrice(['avalanche-2']);
    const avax = data['avalanche-2'];
    if (!avax) throw new Error('CoinGecko returned no AVAX price');

    return {
      price: avax.usd,
      change24h: avax.usd_24h_change || 0,
      marketCap: avax.usd_market_cap || 0,
      volume24h: avax.usd_24h_vol || 0,
    };
  }

  // ── Market data ───────────────────────────────────────────────────────────

  /** Market rows for the Avalanche ecosystem category. */
  async getAvalancheTokens(
    perPage: number = 50,
    page: number = 1,
    sparkline: boolean = true,
  ): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      category: 'avalanche-ecosystem',
      order: 'market_cap_desc',
      per_page: perPage.toString(),
      page: page.toString(),
      sparkline: sparkline.toString(),
      price_change_percentage: '24h,7d',
    });

    return this.fetch<CoinMarketData[]>(`/coins/markets?${params}`);
  }

  /** Market rows for specific coin ids. Ids are sorted so the cache key is order-independent. */
  async getMarketData(coinIds: string[], sparkline: boolean = true): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      ids: Array.from(new Set(coinIds)).sort().join(','),
      order: 'market_cap_desc',
      sparkline: sparkline.toString(),
      price_change_percentage: '24h,7d',
    });

    return this.fetch<CoinMarketData[]>(`/coins/markets?${params}`);
  }

  /** Price history over the last `days` days. */
  async getMarketChart(coinId: string, days: number = 1): Promise<{ prices: [number, number][] }> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      days: days.toString(),
    });

    return this.fetch<{ prices: [number, number][] }>(`/coins/${coinId}/market_chart?${params}`);
  }

  /** Full coin profile: description, links, categories, and market/DEX tickers. */
  async getCoinInfo(id: string): Promise<CoinInfo> {
    return this.fetch<CoinInfo>(
      `/coins/${id}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false&sparkline=false`,
    );
  }
}

export const coingecko = new CoinGeckoClient();
