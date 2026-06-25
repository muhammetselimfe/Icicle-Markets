import { describe, it, expect } from 'vitest';
import {
  tickToPrice,
  formatUsdc,
  parseUsdc,
  getMarketStateLabel,
  generateTicks,
  formatTickAsPrice,
} from '../options';
import { MarketState } from '@/app/types/options';

describe('tickToPrice', () => {
  it('treats divisor=1 ticks as whole dollars', () => {
    expect(tickToPrice(9n, 1)).toBe(9);
    expect(tickToPrice(70000n, 1)).toBe(70000);
  });

  it('treats divisor=100 ticks as cents', () => {
    expect(tickToPrice(900n, 100)).toBe(9);
    expect(tickToPrice(1105n, 100)).toBe(11.05);
  });

  it('defaults divisor to 1', () => {
    expect(tickToPrice(42n)).toBe(42);
  });

  it('handles zero', () => {
    expect(tickToPrice(0n, 100)).toBe(0);
  });
});

describe('formatUsdc', () => {
  it('formats 6-decimal micro-USDC into dollars', () => {
    expect(formatUsdc(1_000_000n)).toBe('$1.00');
    expect(formatUsdc(1_500_000n)).toBe('$1.50');
    expect(formatUsdc(0n)).toBe('$0.00');
  });

  it('rounds to 2 decimals', () => {
    expect(formatUsdc(1_234_567n)).toBe('$1.23');
    expect(formatUsdc(1_235_000n)).toBe('$1.24');
  });

  it('formats large balances', () => {
    expect(formatUsdc(1_000_000_000n)).toBe('$1000.00');
  });
});

describe('parseUsdc', () => {
  it('converts a dollar string to micro-USDC', () => {
    expect(parseUsdc('1')).toBe(1_000_000n);
    expect(parseUsdc('1.5')).toBe(1_500_000n);
    expect(parseUsdc('0.000001')).toBe(1n);
  });

  it('rounds sub-micro precision to the nearest micro-unit', () => {
    expect(parseUsdc('1.2345678')).toBe(1_234_568n);
  });

  it('returns 0 for invalid or negative input', () => {
    expect(parseUsdc('')).toBe(0n);
    expect(parseUsdc('abc')).toBe(0n);
    expect(parseUsdc('-5')).toBe(0n);
  });

  it('round-trips with formatUsdc for clean values', () => {
    for (const v of ['1.00', '12.34', '1000.00']) {
      expect(formatUsdc(parseUsdc(v))).toBe(`$${v}`);
    }
  });
});

describe('generateTicks', () => {
  it('treats the max tick as an exclusive upper bound', () => {
    // AVAX example: $7.00–$11.00 at $0.05 (cents), 80 bins
    const ticks = generateTicks(700n, 1100n, 5n);
    expect(ticks.length).toBe(80);
    expect(ticks[0]).toBe(700n);
    expect(ticks[ticks.length - 1]).toBe(1095n); // last bin starts at max - spacing
    expect(ticks).not.toContain(1100n);
  });

  it('produces evenly spaced ticks', () => {
    expect(generateTicks(0n, 10n, 2n)).toEqual([0n, 2n, 4n, 6n, 8n]);
  });

  it('returns an empty array when min >= max', () => {
    expect(generateTicks(100n, 100n, 5n)).toEqual([]);
    expect(generateTicks(200n, 100n, 5n)).toEqual([]);
  });
});

describe('formatTickAsPrice', () => {
  it('renders dollar-based ticks (divisor=1) with no decimals and thousands separators', () => {
    expect(formatTickAsPrice(70000n, 1)).toBe('$70,000');
    expect(formatTickAsPrice(87n, 1)).toBe('$87');
  });

  it('renders cent-based ticks (divisor=100) with two decimals', () => {
    expect(formatTickAsPrice(900n, 100)).toBe('$9.00');
    expect(formatTickAsPrice(1105n, 100)).toBe('$11.05');
  });
});

describe('getMarketStateLabel', () => {
  it('maps live and pending states', () => {
    expect(getMarketStateLabel(MarketState.Trading)).toBe('Live');
    expect(getMarketStateLabel(MarketState.SettlementOpen)).toBe('Awaiting Settlement');
    expect(getMarketStateLabel(MarketState.PendingOps)).toBe('Processing');
    expect(getMarketStateLabel(MarketState.FailedPendingManual)).toBe('Failed');
  });

  it('distinguishes settled vs expired for finalized states', () => {
    expect(getMarketStateLabel(MarketState.FinalizedPrimary, true)).toBe('Settled');
    expect(getMarketStateLabel(MarketState.FinalizedPrimary, false)).toBe('Expired');
    expect(getMarketStateLabel(MarketState.FinalizedSecondary, true)).toBe('Settled');
  });

  it('falls back to Unknown', () => {
    expect(getMarketStateLabel(9999)).toBe('Unknown');
  });
});

// Locks the settlement-value contract documented in CLAUDE.md:
//   settlementValue = price_usd * tickDivisor * 1e6
//   winningTick     = settlementValue / 1e6
//   settlementPrice = settlementValue / 1e6 / tickDivisor
// A regression here would mis-resolve winners and mis-pay payouts.
describe('settlement value format', () => {
  const winningTick = (settlementValue: bigint) => Number(settlementValue) / 1e6;
  const settlementPrice = (settlementValue: bigint, tickDivisor: number) =>
    Number(settlementValue) / 1e6 / tickDivisor;

  it('AVAX (tickDivisor=100): $9.00 → tick 900', () => {
    const settlementValue = BigInt(9 * 100 * 1e6); // price * divisor * 1e6
    expect(winningTick(settlementValue)).toBe(900);
    expect(settlementPrice(settlementValue, 100)).toBe(9);
  });

  it('WTI/XAU/BTC (tickDivisor=1): $87 → tick 87', () => {
    const settlementValue = BigInt(87 * 1 * 1e6);
    expect(winningTick(settlementValue)).toBe(87);
    expect(settlementPrice(settlementValue, 1)).toBe(87);
  });

  it('the winning tick lands inside the correct bin', () => {
    // AVAX market $7.00–$11.00, $0.05 bins. Settlement $9.03 → tick 903.
    const ticks = generateTicks(700n, 1100n, 5n);
    const settlementValue = BigInt(Math.round(9.03 * 100 * 1e6));
    const tick = Math.floor(winningTick(settlementValue));
    const binStart = ticks.filter((t) => Number(t) <= tick).at(-1);
    expect(binStart).toBe(900n); // bin [900, 905) contains tick 903
  });
});
