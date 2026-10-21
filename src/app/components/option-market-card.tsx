import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { MarketState, type MarketDisplay } from '@/app/types/options';
import { formatTickAsPrice, tickToPrice } from '@/app/utils/options';
import { useRedstonePrice } from '@/app/hooks/useRedstonePrice';

// Live countdown to a unix timestamp, formatted compactly.
export function useCountdown(targetUnix: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetUnix - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const left = Math.max(0, targetUnix - Math.floor(Date.now() / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetUnix]);

  if (remaining <= 0) return null;
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// Lightweight CLMSR-style distribution: a soft bell peaked at where the live
// price currently sits within the market's price range. No extra RPC — the
// full per-bin probabilities live on the trade page.
export function RangeDistribution({
  minPrice,
  maxPrice,
  current,
  bins = 28,
  className = 'h-[64px]',
}: {
  minPrice: number;
  maxPrice: number;
  current: number;
  bins?: number;
  className?: string;
}) {
  const valid = current > 0 && maxPrice > minPrice;
  const pos = valid ? Math.min(1, Math.max(0, (current - minPrice) / (maxPrice - minPrice))) : 0.5;
  const peak = pos * (bins - 1);
  const sigma = bins * 0.16;

  return (
    <div className={cn('flex items-end gap-[3px]', className)} aria-hidden="true">
      {Array.from({ length: bins }).map((_, i) => {
        const d = i - peak;
        const g = Math.exp(-(d * d) / (2 * sigma * sigma));
        const h = Math.max(6, 6 + g * 52);
        const near = Math.abs(d) <= 1.3;
        return (
          <div
            key={i}
            className={cn('flex-1 rounded-[2px]', near ? 'bg-ice-accent' : g > 0.3 ? 'bg-ice-accent2' : 'bg-ice-line')}
            style={{ height: `${h}px`, opacity: near ? 1 : g > 0.3 ? 0.65 : 0.18 }}
          />
        );
      })}
    </div>
  );
}

export function AssetLogo({ src, symbol, className = 'w-9 h-9' }: { src: string; symbol: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn('rounded-full bg-ice-line/[0.1] flex items-center justify-center text-ice-text text-[12px] font-semibold shrink-0', className)}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return <img src={src} alt="" className={cn('rounded-full shrink-0', className)} onError={() => setFailed(true)} />;
}

/** Sentence-case market state pill. */
export function MarketStateBadge({ state, label }: { state: MarketState; label: string }) {
  const tone: Record<number, string> = {
    [MarketState.Trading]: 'bg-ice-up/[0.1] text-ice-up',
    [MarketState.SettlementOpen]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.PendingOps]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.FinalizedPrimary]: 'bg-ice-line/[0.08] text-ice-muted',
    [MarketState.FinalizedSecondary]: 'bg-ice-line/[0.08] text-ice-muted',
    [MarketState.FailedPendingManual]: 'bg-ice-down/10 text-ice-down',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[12px] font-medium whitespace-nowrap', tone[state] ?? 'bg-ice-line/[0.08] text-ice-muted')}>
      {state === MarketState.Trading && <span className="w-1.5 h-1.5 rounded-full bg-ice-up" />}
      {label}
    </span>
  );
}

/** A live prediction market: asset, time left, where the price sits in the range. */
export function OptionMarketCard({ market: m, onClick }: { market: MarketDisplay; onClick: () => void }) {
  const { price } = useRedstonePrice(m.feedId);
  const countdown = useCountdown(m.tradingEnd);

  const fmtPrice = m.priceDecimals === 0 ? `$${Math.round(price).toLocaleString('en-US')}` : `$${price.toFixed(2)}`;
  const minPrice = tickToPrice(m.minTick, m.tickDivisor);
  const maxPrice = tickToPrice(m.maxTick, m.tickDivisor);
  const isTrading = m.state === MarketState.Trading;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-2xl bg-ice-surface border border-ice-line/15 hover:border-ice-line/40 transition-colors p-4 md:p-5 flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <AssetLogo src={m.assetLogo} symbol={m.assetSymbol} />
        <div className="flex-1 min-w-0">
          <div className="text-ice-text font-semibold text-[16px] leading-tight">{m.assetSymbol}/USD</div>
          <div className="text-ice-muted text-[13px] truncate">
            {isTrading && countdown ? `Ends in ${countdown}` : m.assetName || `Market #${m.marketId}`}
          </div>
        </div>
        <MarketStateBadge state={m.state} label={m.stateLabel} />
      </div>

      <div>
        <RangeDistribution minPrice={minPrice} maxPrice={maxPrice} current={price} />
        <div className="flex items-center justify-between mt-2 text-[12px] tabular-nums">
          <span className="text-ice-faint">{formatTickAsPrice(m.minTick, m.tickDivisor)}</span>
          {price > 0 && <span className="text-ice-accent font-medium">Now {fmtPrice}</span>}
          <span className="text-ice-faint">{formatTickAsPrice(m.maxTick, m.tickDivisor)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-ice-line/10">
        <span className="text-ice-muted text-[13px]">
          {m.numBins} bins · {formatTickAsPrice(m.tickSpacing, m.tickDivisor)} each
        </span>
        <span className="inline-flex items-center gap-1 text-ice-accent text-[14px] font-medium">
          {isTrading ? 'Trade' : 'View'}
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}
