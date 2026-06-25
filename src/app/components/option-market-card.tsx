import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
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
  className = 'h-[68px]',
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
    <div className={`flex items-end gap-[3px] ${className}`}>
      {Array.from({ length: bins }).map((_, i) => {
        const d = i - peak;
        const g = Math.exp(-(d * d) / (2 * sigma * sigma));
        const h = Math.max(7, 7 + g * 55);
        const near = Math.abs(d) <= 1.3;
        return (
          <div
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: `${h}px`,
              background: near ? '#8be4ff' : g > 0.3 ? '#4db8ff' : '#2b3a66',
              opacity: near ? 1 : g > 0.3 ? 0.7 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
}

// Shared trading-market card used by the Markets prediction section and the
// Options listing's live markets — so they read as siblings.
export function OptionMarketCard({ market: m, onClick }: { market: MarketDisplay; onClick: () => void }) {
  const { price } = useRedstonePrice(m.feedId);
  const countdown = useCountdown(m.tradingEnd);
  const [logoFailed, setLogoFailed] = useState(false);

  const fmtPrice = m.priceDecimals === 0 ? `$${Math.round(price).toLocaleString()}` : `$${price.toFixed(2)}`;
  const minPrice = tickToPrice(m.minTick, m.tickDivisor);
  const maxPrice = tickToPrice(m.maxTick, m.tickDivisor);
  const isTrading = m.state === MarketState.Trading;

  return (
    <div
      onClick={onClick}
      className="group relative bg-ice-surface border border-ice-line/15 rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-ice-line/40 hover:bg-ice-surface2"
    >
      <div className="p-[18px] space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {!m.assetLogo || logoFailed ? (
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {m.assetSymbol.slice(0, 2)}
            </div>
          ) : (
            <img src={m.assetLogo} alt={m.assetSymbol} className="w-9 h-9 rounded-full shrink-0" onError={() => setLogoFailed(true)} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-ice-text font-bold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              {m.assetSymbol}/USD
            </div>
            <div className="text-ice-muted truncate" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
              {m.assetName || `Market #${m.marketId}`}
            </div>
          </div>
          {isTrading ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ice-up/[0.08] border border-ice-up/20">
              <span className="w-1.5 h-1.5 rounded-full bg-ice-up" />
              <span className="font-mono text-ice-up" style={{ fontSize: '11px' }}>Trading</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ice-line/[0.06] border border-ice-line/15">
              <span className="font-mono text-ice-faint" style={{ fontSize: '11px' }}>{m.stateLabel}</span>
            </div>
          )}
        </div>

        {/* Distribution */}
        <RangeDistribution minPrice={minPrice} maxPrice={maxPrice} current={price} />

        {/* Range labels */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-ice-faint" style={{ fontSize: '11px' }}>{formatTickAsPrice(m.minTick, m.tickDivisor)}</span>
          <span className="font-mono text-ice-accent" style={{ fontSize: '11px' }}>range</span>
          <span className="font-mono text-ice-faint" style={{ fontSize: '11px' }}>{formatTickAsPrice(m.maxTick, m.tickDivisor)}</span>
        </div>

        <div className="h-px bg-ice-line/15" />

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-5">
            {price > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-ice-faint" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>PRICE</span>
                <span className="font-mono font-semibold text-ice-text" style={{ fontSize: '13px' }}>{fmtPrice}</span>
              </div>
            )}
            {countdown && (
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-ice-faint" style={{ fontSize: '9px', letterSpacing: '0.5px' }}>ENDS IN</span>
                <span className="font-mono font-semibold text-ice-accent" style={{ fontSize: '13px' }}>{countdown}</span>
              </div>
            )}
          </div>
          <div
            className="flex items-center justify-center gap-1.5 px-[18px] py-2 rounded-[9px] transition-transform group-hover:translate-x-0.5"
            style={{ background: 'linear-gradient(180deg, #8be4ff 0%, #4db8ff 100%)' }}
          >
            <span className="font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#06223a' }}>{isTrading ? 'Trade' : 'View'}</span>
            <ArrowRight className="w-3.5 h-3.5" style={{ color: '#06223a' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
