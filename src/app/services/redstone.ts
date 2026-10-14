/**
 * RedStone price data.
 *
 * The options contracts settle on RedStone's `redstone-primary-prod` data
 * service, so the UI must show the same feed: both the live price and the
 * chart history come from RedStone, never from a third-party aggregator.
 *
 * Two hosts are involved:
 *  - LEGACY_API: the long-standing `api.redstone.finance` host. It still
 *    serves the latest value for a feed, but its history queries (limit,
 *    offset, timestamp ranges) now return an empty array.
 *  - EXPLORER_API: the backend behind app.redstone.finance. It serves
 *    per-minute history for 1 day, 10-minute for 7 days and hourly for 30
 *    days, plus a latest-price route. It is not a documented public API, so
 *    every call here is defensive and the latest price falls back between
 *    the two hosts.
 */

const LEGACY_API = 'https://api.redstone.finance';
const EXPLORER_API = 'https://o40uhl5zq9.execute-api.us-east-1.amazonaws.com';
const DATA_SERVICE_ID = 'redstone-primary-prod';
const TIMEOUT_MS = 10_000;

export interface RedstonePrice {
  price: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

export interface ChartPoint {
  /** Unix timestamp in milliseconds */
  time: number;
  price: number;
}

/** History ranges the explorer backend accepts (whole days). */
export type HistoryRangeDays = 1 | 7 | 30;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface LegacyPriceRow {
  symbol: string;
  value: number;
  timestamp: number;
}

/**
 * The legacy host's single-feed route (`?symbol=X`) now returns `[]` for every
 * provider. The multi-feed route (`?symbols=X,Y`) still serves the latest value,
 * as an object keyed by symbol, so query that form even for one feed.
 */
async function fetchLatestFromLegacy(feedId: string): Promise<RedstonePrice> {
  const body = await getJson<Record<string, LegacyPriceRow>>(
    `${LEGACY_API}/prices?symbols=${encodeURIComponent(feedId)}&provider=${DATA_SERVICE_ID}`,
  );
  const row = body && typeof body === 'object' ? body[feedId] : undefined;
  if (!row || typeof row.value !== 'number' || row.value <= 0) {
    throw new Error(`No price data for ${feedId}`);
  }
  return { price: row.value, timestamp: row.timestamp };
}

interface ExplorerLatestResponse {
  success: boolean;
  data?: { symbol: string; currentPrice: number; timestamp: number };
}

async function fetchLatestFromExplorer(feedId: string): Promise<RedstonePrice> {
  const body = await getJson<ExplorerLatestResponse>(
    `${EXPLORER_API}/prices/pull/latest?symbol=${encodeURIComponent(feedId)}`,
  );
  const d = body.data;
  if (!body.success || !d || typeof d.currentPrice !== 'number' || d.currentPrice <= 0) {
    throw new Error(`No price data for ${feedId}`);
  }
  return { price: d.currentPrice, timestamp: d.timestamp };
}

/**
 * Latest value of a RedStone primary-prod feed. Tries the legacy host first
 * (it is the one the app has always used) and falls back to the explorer
 * backend if the legacy host errors or returns nothing.
 */
export async function fetchRedstoneLatestPrice(feedId: string): Promise<RedstonePrice> {
  try {
    return await fetchLatestFromLegacy(feedId);
  } catch (legacyErr) {
    try {
      return await fetchLatestFromExplorer(feedId);
    } catch {
      throw legacyErr instanceof Error ? legacyErr : new Error('Failed to fetch RedStone price');
    }
  }
}

interface ExplorerHistoryResponse {
  success: boolean;
  error?: string;
  data?: {
    symbol: string;
    onChainUpdates?: { value: number; timestamp: number }[];
  };
}

/**
 * Price history for a feed, oldest first. `rangeDays` must be 1, 7 or 30;
 * the backend rejects anything else.
 */
export async function fetchRedstonePriceHistory(
  feedId: string,
  rangeDays: HistoryRangeDays,
): Promise<ChartPoint[]> {
  const body = await getJson<ExplorerHistoryResponse>(
    `${EXPLORER_API}/prices/pull/historical?symbol=${encodeURIComponent(feedId)}&range=${rangeDays}`,
  );
  if (!body.success) throw new Error(body.error || `No history for ${feedId}`);

  const updates = body.data?.onChainUpdates ?? [];
  const points: ChartPoint[] = [];
  for (const u of updates) {
    if (typeof u.value === 'number' && typeof u.timestamp === 'number' && u.value > 0) {
      points.push({ time: u.timestamp, price: u.value });
    }
  }
  points.sort((a, b) => a.time - b.time);
  return points;
}

/** Smallest backend range that covers `minutes` of history. */
export function historyRangeForMinutes(minutes: number): HistoryRangeDays {
  if (minutes <= 24 * 60) return 1;
  if (minutes <= 7 * 24 * 60) return 7;
  return 30;
}

/**
 * Keep only the last `minutes` of points and thin them to at most `maxPoints`,
 * always preserving the newest point so the line ends at the live price.
 */
export function sliceAndDownsample(
  points: ChartPoint[],
  minutes: number,
  maxPoints: number = 200,
): ChartPoint[] {
  if (points.length === 0) return points;

  const newest = points[points.length - 1].time;
  const cutoff = newest - minutes * 60_000;
  let window = points.filter((p) => p.time >= cutoff);
  if (window.length === 0) window = [points[points.length - 1]];

  if (window.length <= maxPoints) return window;

  const step = Math.floor(window.length / maxPoints);
  const sampled: ChartPoint[] = [];
  for (let i = 0; i < window.length; i += step) sampled.push(window[i]);
  const last = window[window.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}
