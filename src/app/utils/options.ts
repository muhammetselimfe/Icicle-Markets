import { MarketState } from '@/app/types/options';

// Convert a raw tick to a dollar price.
// divisor=1: tick represents dollars (tick=9 → $9.00)
// divisor=100: tick represents cents (tick=900 → $9.00)
export function tickToPrice(tick: bigint, divisor: number = 1): number {
  return Number(tick) / divisor;
}

export function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1e6;
  return `$${dollars.toFixed(2)}`;
}

export function parseUsdc(input: string): bigint {
  const num = parseFloat(input);
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.round(num * 1e6));
}

export function getMarketStateLabel(state: number, settled?: boolean): string {
  switch (state) {
    case MarketState.Trading:
      return 'Live';
    case MarketState.SettlementOpen:
      return 'Awaiting Settlement';
    case MarketState.PendingOps:
      return 'Processing';
    case MarketState.FinalizedPrimary:
    case MarketState.FinalizedSecondary:
      return settled ? 'Settled' : 'Expired';
    case MarketState.FailedPendingManual:
      return 'Failed';
    default:
      return 'Unknown';
  }
}

export function generateTicks(min: bigint, max: bigint, spacing: bigint): bigint[] {
  const ticks: bigint[] = [];
  // maxTick is exclusive upper bound; last bin starts at max - spacing
  for (let t = min; t < max; t += spacing) {
    ticks.push(t);
  }
  return ticks;
}

export function formatTickAsPrice(tick: bigint, divisor: number = 1): string {
  const price = tickToPrice(tick, divisor);
  // Dollar-based ticks (WTI, gold, BTC): no decimals, with commas
  if (divisor === 1) {
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
