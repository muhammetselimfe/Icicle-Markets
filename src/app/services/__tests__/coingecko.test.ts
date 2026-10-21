import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CoinGeckoClient,
  CoinGeckoRateLimitError,
  BATCH_WINDOW_MS,
  FRESH_MS,
  STALE_MS,
  DEFAULT_BACKOFF_MS,
  NETWORK_BACKOFF_MS,
} from '../coingecko';

const BASE = 'https://cg.test/api/v3';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function priceBody(ids: string[]) {
  return Object.fromEntries(ids.map((id, i) => [id, { usd: 10 + i, usd_24h_change: 1 }]));
}

/** Price response built from whatever ids the request asked for. */
function priceFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    return jsonResponse(priceBody(ids));
  });
}

let now = 1_000_000;
const clock = () => now;

beforeEach(() => {
  now = 1_000_000;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Resolve a batched price call: flush the batch window, then the fetch. */
async function settle<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {}); // a rejection may land before the caller's matcher attaches
  await vi.advanceTimersByTimeAsync(BATCH_WINDOW_MS);
  return p;
}

describe('getSimplePrice batching', () => {
  it('merges concurrent calls into one request and returns each caller its own ids', async () => {
    const fetchMock = priceFetch();
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    const [avax, swap, portfolio] = await settle(
      Promise.all([
        client.getSimplePrice(['avalanche-2']),
        client.getSimplePrice(['usd-coin', 'avalanche-2']),
        client.getSimplePrice(['avalanche-2', 'joe', 'usd-coin']),
      ]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v3/simple/price');
    expect(url.searchParams.get('ids')).toBe('avalanche-2,joe,usd-coin');
    expect(url.searchParams.get('include_market_cap')).toBe('true');

    expect(Object.keys(avax)).toEqual(['avalanche-2']);
    expect(Object.keys(swap).sort()).toEqual(['avalanche-2', 'usd-coin']);
    expect(Object.keys(portfolio).sort()).toEqual(['avalanche-2', 'joe', 'usd-coin']);
  });

  it('lets a later caller ride a batch that is already on the wire', async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((r) => { release = r; }))
      .mockImplementation(priceFetch());
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    const first = client.getSimplePrice(['avalanche-2']);
    await vi.advanceTimersByTimeAsync(BATCH_WINDOW_MS); // batch dispatched, response pending
    const second = client.getSimplePrice(['avalanche-2', 'usd-coin']);
    await vi.advanceTimersByTimeAsync(BATCH_WINDOW_MS); // usd-coin batch dispatched
    release(jsonResponse(priceBody(['avalanche-2'])));

    const [a, b] = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('ids')).toBe('usd-coin');
    expect(a['avalanche-2'].usd).toBe(10);
    expect(Object.keys(b).sort()).toEqual(['avalanche-2', 'usd-coin']);
  });

  it('serves cached ids without a request and only fetches the missing ones', async () => {
    const fetchMock = priceFetch();
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await settle(client.getSimplePrice(['avalanche-2']));
    const again = await client.getSimplePrice(['avalanche-2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again['avalanche-2'].usd).toBe(10);

    await settle(client.getSimplePrice(['avalanche-2', 'joe']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('ids')).toBe('joe');
  });

  it('refetches once the price cache is older than FRESH_MS', async () => {
    const fetchMock = priceFetch();
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await settle(client.getSimplePrice(['avalanche-2']));
    now += FRESH_MS;
    await settle(client.getSimplePrice(['avalanche-2']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not re-request ids CoinGecko did not return', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ 'avalanche-2': { usd: 10 } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    const first = await settle(client.getSimplePrice(['avalanche-2', 'unknown-token']));
    expect(first).toEqual({ 'avalanche-2': { usd: 10 } });
    await settle(client.getSimplePrice(['unknown-token']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getAvaxPrice maps the simple price fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ 'avalanche-2': { usd: 9.5, usd_24h_change: -2.5, usd_market_cap: 4e9, usd_24h_vol: 3e8 } }),
      ),
    );
    const client = new CoinGeckoClient(BASE, clock);
    const avax = await settle(client.getAvaxPrice());
    expect(avax).toEqual({ price: 9.5, change24h: -2.5, marketCap: 4e9, volume24h: 3e8 });
  });
});

describe('response cache and in-flight dedupe', () => {
  it('shares one request between identical concurrent endpoint calls', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ id: 'joe' }]));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await Promise.all([client.getMarketData(['joe']), client.getMarketData(['joe'])]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses an order-independent cache key for market data ids', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await client.getMarketData(['joe', 'avalanche-2']);
    await client.getMarketData(['avalanche-2', 'joe']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('rate limiting', () => {
  it('throws CoinGeckoRateLimitError on 429 and holds later calls for Retry-After', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '30' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await expect(client.getMarketChart('joe', 1)).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(client.backoffRemainingMs).toBe(30_000);

    // A different endpoint during the hold-off fails fast without a network call.
    await expect(client.getCoinInfo('joe')).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 30_000;
    await expect(client.getCoinInfo('joe')).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('defaults the hold-off when Retry-After is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const client = new CoinGeckoClient(BASE, clock);
    await expect(client.getMarketChart('joe', 1)).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(client.backoffRemainingMs).toBe(DEFAULT_BACKOFF_MS);
  });

  it('serves a stale response instead of failing while rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ prices: [[1, 2]] }))
      .mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await client.getMarketChart('joe', 1);
    now += FRESH_MS; // cache expired, next call hits the network and gets a 429
    await expect(client.getMarketChart('joe', 1)).resolves.toEqual({ prices: [[1, 2]] });
    // Still within the hold-off: served from stale cache with no network call.
    await expect(client.getMarketChart('joe', 1)).resolves.toEqual({ prices: [[1, 2]] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now += STALE_MS; // stale window over, hold-off also over: fails for real
    await expect(client.getMarketChart('joe', 1)).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
  });

  it('serves stale prices while rate limited when every requested id has one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(priceBody(['avalanche-2'])))
      .mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await settle(client.getSimplePrice(['avalanche-2']));
    now += FRESH_MS;
    const stale = await settle(client.getSimplePrice(['avalanche-2']));
    expect(stale['avalanche-2'].usd).toBe(10);

    // An id with no cached price cannot be served stale, so the error surfaces.
    await expect(settle(client.getSimplePrice(['avalanche-2', 'joe']))).rejects.toBeInstanceOf(
      CoinGeckoRateLimitError,
    );
  });

  it('falls back to a stale response on network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ prices: [] }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    await client.getMarketChart('joe', 7);
    now += FRESH_MS;
    await expect(client.getMarketChart('joe', 7)).resolves.toEqual({ prices: [] });
  });

  it('treats a network failure as a short hold-off so nothing retries into a hidden 429', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CoinGeckoClient(BASE, clock);

    const err = await client.getMarketChart('joe', 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoinGeckoRateLimitError);
    expect((err as CoinGeckoRateLimitError).reason).toBe('network');
    expect(client.backoffRemainingMs).toBe(NETWORK_BACKOFF_MS);

    await expect(client.getCoinInfo('joe')).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += NETWORK_BACKOFF_MS;
    await expect(client.getCoinInfo('joe')).rejects.toBeInstanceOf(CoinGeckoRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
