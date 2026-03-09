import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Check,
  Settings,
  ChevronUp,
  ChevronDown,
  Info,
} from 'lucide-react';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';

import { toast } from 'sonner';
import { cn } from '@/app/components/ui/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/app/components/ui/tooltip';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { ERC20_ABI } from '@/app/config/options-abis';
import { useSpendToQuantity } from '@/app/hooks/useSpendToQuantity';
import { useOptionsTrading } from '@/app/hooks/useOptionsTrading';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { useOptionsPositions } from '@/app/hooks/useOptionsPositions';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useRedstonePrice } from '@/app/hooks/useRedstonePrice';
import { useAssetChartData } from '@/app/hooks/useAssetChartData';
import { useBinProbabilities } from '@/app/hooks/useBinProbabilities';
import { MarketState, type PositionDisplay } from '@/app/types/options';
import { generateTicks, formatTickAsPrice, formatUsdc, tickToPrice } from '@/app/utils/options';

const SLIPPAGE_OPTIONS = [
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '3%', value: 300 },
];

const FONT = { fontFamily: 'Inter, sans-serif' };

const AMOUNT_PRESETS = [5, 10, 25];

const RANGE_PRESETS = [
  { label: 'Tight ±1%', pct: 0.01 },
  { label: 'Medium ±3%', pct: 0.03 },
  { label: 'Wide ±5%', pct: 0.05 },
];

// --- Mini Sparkline ---
function MiniSparkline({ data }: { data: { time: number; price: number }[] }) {
  if (data.length < 2) return null;
  const w = 60, h = 24;
  const prices = data.map((d) => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const tMin = data[0].time;
  const tRange = data[data.length - 1].time - tMin || 1;
  const points = data
    .map((d) => `${((d.time - tMin) / tRange) * w},${h - ((d.price - minP) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="hidden sm:inline-block align-middle">
      <polyline points={points} fill="none" stroke="#f87171" strokeWidth={1.5} />
    </svg>
  );
}

// --- Asset logo with fallback ---
function AssetLogo({ src, symbol, size = 32 }: { src: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return <img src={src} alt={symbol} className="rounded-full shrink-0" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
}

// --- Info tooltip helper ---
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex align-middle ml-1 text-slate-600 hover:text-slate-400 transition-colors">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[220px] bg-[#1e293b] text-slate-200 border border-white/10 px-3 py-2 text-xs leading-relaxed"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// --- Countdown timer ---
function useCountdown(targetTimestamp: number) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, targetTimestamp * 1000 - now);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return {
    formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    expired: diff === 0,
  };
}

function formatDate(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// --- Stepper Input ---
function TickStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  tickDivisor = 1,
}: {
  label: string;
  value: bigint;
  onChange: (v: bigint) => void;
  min: bigint;
  max: bigint;
  step: bigint;
  tickDivisor?: number;
}) {
  return (
    <div className="flex-1">
      <div className="text-slate-500 mb-1.5" style={{ ...FONT, fontSize: '12px' }}>
        {label}
      </div>
      <div className="flex items-center gap-0 bg-white/5 rounded-xl overflow-hidden">
        <div className="flex-1 px-3 py-2.5 text-white font-medium text-center" style={{ ...FONT, fontSize: '15px' }}>
          {formatTickAsPrice(value, tickDivisor)}
        </div>
        <div className="flex flex-col border-l border-white/10">
          <button
            onClick={() => value + step <= max && onChange(value + step)}
            disabled={value + step > max}
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => value - step >= min && onChange(value - step)}
            disabled={value - step < min}
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Market Chart Chart (horizontal bar chart with draggable range) ---
function PriceDistributionChart({
  bins,
  chartData,
  currentPrice,
  selectedMin,
  selectedMax,
  minPrice,
  maxPrice,
  tickSpacing,
  numBins,
  priceDecimals = 2,
  timeframeMinutes = 1440,
  onRangeChange,
}: {
  bins: { tick: bigint; price: number; probability: number }[];
  chartData: { time: number; price: number }[];
  currentPrice: number;
  selectedMin: number;
  selectedMax: number;
  minPrice: number;
  maxPrice: number;
  tickSpacing: number;
  numBins: number;
  priceDecimals?: number;
  timeframeMinutes?: number;
  onRangeChange: (newMin: number, newMax: number) => void;
}) {
  const fmtPrice = (p: number) => priceDecimals === 0 ? `$${Math.round(p).toLocaleString()}` : `$${p.toFixed(priceDecimals)}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(700);
  const svgH = 420;
  const uid = useId();

  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  const [hoverBin, setHoverBin] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSvgW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setSvgW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Layout: price labels left, bars fill rest, small right margin
  // Wider left padding for large price labels (e.g. $5,118 vs $9.00)
  const padL = priceDecimals === 0 && maxPrice > 1000 ? 72 : 52;
  const padR = 12, padT = 8, padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Auto-zoom: focus on the range that matters (current price, selected range, active bins)
  // Instead of showing full $7-$11, zoom to where the action is
  const { viewMin, viewMax } = useMemo(() => {
    // Find the range of bins with meaningful probability
    const threshold = 0.001; // 0.1% minimum to be "meaningful"
    let probLo = maxPrice, probHi = minPrice;
    for (const b of bins) {
      if (b.probability > threshold) {
        probLo = Math.min(probLo, b.price);
        probHi = Math.max(probHi, b.price + tickSpacing);
      }
    }
    // If no meaningful bins, fall back to current price area
    if (probLo >= probHi) {
      probLo = currentPrice - tickSpacing * 5;
      probHi = currentPrice + tickSpacing * 5;
    }

    // Ensure selected range and current price are visible
    const lo = Math.min(probLo, selectedMin, currentPrice - tickSpacing);
    const hi = Math.max(probHi, selectedMax, currentPrice + tickSpacing);

    // Add padding (~20% on each side, at least 5 bins)
    const span = hi - lo;
    const pad = Math.max(span * 0.2, tickSpacing * 5);
    return {
      viewMin: Math.max(minPrice, Math.floor((lo - pad) / tickSpacing) * tickSpacing),
      viewMax: Math.min(maxPrice + tickSpacing, Math.ceil((hi + pad) / tickSpacing) * tickSpacing),
    };
  }, [bins, currentPrice, selectedMin, selectedMax, minPrice, maxPrice, tickSpacing]);

  const priceRange = viewMax - viewMin || 1;

  // Y scale: price → pixel (uses zoomed view range)
  const toY = useCallback(
    (price: number) => padT + plotH * (1 - (price - viewMin) / priceRange),
    [plotH, viewMin, priceRange],
  );
  const fromY = useCallback(
    (y: number) => viewMin + (1 - (y - padT) / plotH) * priceRange,
    [plotH, viewMin, priceRange],
  );

  const snapToTick = useCallback(
    (rawPrice: number) => {
      const snapped = Math.round((rawPrice - minPrice) / tickSpacing) * tickSpacing + minPrice;
      return Math.max(minPrice, Math.min(maxPrice + tickSpacing, snapped));
    },
    [minPrice, maxPrice, tickSpacing],
  );

  const clientToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * svgW,
        y: ((clientY - rect.top) / rect.height) * svgH,
      };
    },
    [svgW, svgH],
  );

  // Drag handlers
  const handlePointerDown = useCallback(
    (handle: 'min' | 'max') => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
      setDragging(handle);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const svgPt = clientToSvg(e.clientX, e.clientY);

      if (dragging) {
        const rawPrice = fromY(svgPt.y);
        const snapped = snapToTick(rawPrice);
        if (dragging === 'max') {
          const newMax = Math.max(snapped, selectedMin + tickSpacing);
          if (newMax !== selectedMax) onRangeChange(selectedMin, newMax);
        } else {
          const newMin = Math.min(snapped, selectedMax - tickSpacing);
          if (newMin !== selectedMin) onRangeChange(newMin, selectedMax);
        }
      } else {
        // Find hovered bin
        const price = fromY(svgPt.y);
        const idx = bins.findIndex((b) => price >= b.price && price < b.price + tickSpacing);
        setHoverBin(idx >= 0 && svgPt.x >= padL ? idx : null);
      }
    },
    [dragging, clientToSvg, fromY, snapToTick, selectedMin, selectedMax, tickSpacing, onRangeChange, bins, padL],
  );

  const handlePointerLeave = useCallback(() => { setDragging(null); setHoverBin(null); }, []);
  const handlePointerUp = useCallback(() => { setDragging(null); }, []);

  // Probability scaling — use relative scaling so small differences are visible
  const maxProb = useMemo(() => Math.max(...bins.map((b) => b.probability), 0.001), [bins]);
  const minProb = useMemo(() => Math.min(...bins.filter(b => b.probability > 0).map(b => b.probability), maxProb), [bins, maxProb]);
  // If distribution is nearly flat, scale from min to max so differences pop out
  // Always show a minimum bar width (15% of plot) so bins aren't invisible
  const probSpread = maxProb - minProb;
  const isFlat = probSpread < maxProb * 0.3; // less than 30% variation = "flat"

  // Bin pixel height
  const binH = Math.abs(toY(0) - toY(tickSpacing));
  const gap = Math.max(0.5, binH * 0.08);

  // Y axis: adapt tick step to zoomed view range
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const raw = priceRange / 8;
    // Dynamic step size that works for both small prices ($9) and large prices ($5,100)
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 0.01))));
    const norm = raw / mag;
    const nice = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
    const step = nice * mag;
    for (let p = Math.ceil(viewMin / step) * step; p <= viewMax + 0.001; p += step) {
      ticks.push(Math.round(p * 100) / 100);
    }
    return ticks;
  }, [viewMin, viewMax, priceRange]);

  const selMinY = toY(selectedMin);
  const selMaxY = toY(selectedMax);
  const curY = toY(currentPrice);

  // Handle dimensions
  const handleBarW = 50;
  const handleBarH = 6;
  const handleHitH = 24;
  const handleCx = padL + plotW * 0.5;

  const clipId = `${uid}-clip`;
  const gradId = `${uid}-priceFill`;

  // Time → X scale for price line overlay
  const hasData = chartData.length > 0;
  const tMin = hasData ? chartData[0].time : Date.now() - 86400000;
  const tMax = hasData ? chartData[chartData.length - 1].time : Date.now();
  const tRange = tMax - tMin || 1;
  const toX = useCallback(
    (t: number) => padL + ((t - tMin) / tRange) * plotW,
    [padL, tMin, tRange, plotW],
  );

  // Price history SVG path
  const pricePath = useMemo(() => {
    if (!hasData) return '';
    return chartData
      .map((d, i) => {
        const x = Math.max(padL, Math.min(padL + plotW, toX(d.time)));
        const y = Math.max(padT, Math.min(padT + plotH, toY(d.price)));
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join('');
  }, [chartData, hasData, padL, padT, plotW, plotH, toX, toY]);

  // Area fill path (closed shape under the price line)
  const priceAreaPath = useMemo(() => {
    if (!hasData || !pricePath) return '';
    const firstX = Math.max(padL, Math.min(padL + plotW, toX(chartData[0].time)));
    const lastX = Math.max(padL, Math.min(padL + plotW, toX(chartData[chartData.length - 1].time)));
    const bottomY = padT + plotH;
    return `${pricePath}L${lastX.toFixed(1)},${bottomY.toFixed(1)}L${firstX.toFixed(1)},${bottomY.toFixed(1)}Z`;
  }, [pricePath, hasData, chartData, padL, plotW, plotH, padT, toX]);

  // Time axis labels
  const timeLabels = useMemo(() => {
    if (!hasData) return [];
    const count = 6;
    const labels: { time: number; x: number; label: string }[] = [];
    for (let i = 0; i < count; i++) {
      const t = tMin + (tRange * i) / (count - 1);
      const x = toX(t);
      const d = new Date(t);
      let label: string;
      if (timeframeMinutes <= 240) {
        // 15m, 1H, 4H — show HH:MM
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        // 1D+ — show "Mon HH:MM" or just HH:MM if same day
        const now = new Date();
        if (d.getDate() !== now.getDate() || d.getMonth() !== now.getMonth()) {
          label = d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        } else {
          label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }
      labels.push({ time: t, x, label });
    }
    return labels;
  }, [hasData, tMin, tRange, toX, timeframeMinutes]);

  const lastPt = hasData ? chartData[chartData.length - 1] : null;

  // Hovered bin data for tooltip
  const hoveredBin = hoverBin !== null ? bins[hoverBin] : null;

  return (
    <div ref={containerRef} style={{ width: '100%', userSelect: dragging ? 'none' : undefined }}>
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        style={{ display: 'block', overflow: 'hidden', cursor: dragging ? 'ns-resize' : undefined }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0} />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Probability bars — full width horizontal */}
          {bins.map((b, i) => {
            const y = toY(b.price + tickSpacing);
            const h = binH - gap;
            if (h <= 0 || b.probability <= 0) return null;
            const isSel = b.price >= selectedMin && b.price < selectedMax;
            const isHov = hoverBin === i;
            // Relative scaling: when distribution is flat, stretch differences
            // so the highest bin fills ~85% and lowest fills ~15%
            const ratio = isFlat && probSpread > 0
              ? 0.15 + 0.7 * ((b.probability - minProb) / probSpread)
              : b.probability / maxProb;
            const barW = Math.max(ratio * plotW * 0.85, 2);
            return (
              <rect
                key={b.price}
                x={padL}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill={isSel ? '#818cf8' : '#475569'}
                opacity={isHov ? 0.9 : isSel ? 0.5 + 0.4 * ratio : 0.2 + 0.5 * ratio}
                rx={2}
                style={{ transition: 'width 300ms ease, opacity 200ms ease' }}
              />
            );
          })}

          {/* Selected range background */}
          <rect
            x={padL}
            y={selMaxY}
            width={plotW}
            height={Math.max(selMinY - selMaxY, 0)}
            fill="#818cf8"
            opacity={0.06}
          />

          {/* Selected range border lines */}
          <line x1={padL} y1={selMaxY} x2={padL + plotW} y2={selMaxY} stroke="#6366f1" strokeWidth={1.5} />
          <line x1={padL} y1={selMinY} x2={padL + plotW} y2={selMinY} stroke="#6366f1" strokeWidth={1.5} />

          {/* Price history area fill */}
          {priceAreaPath && (
            <path d={priceAreaPath} fill={`url(#${gradId})`} />
          )}

          {/* Price history line */}
          {pricePath && (
            <path d={pricePath} fill="none" stroke="#ff6b6b" strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
          )}

          {/* Last price dot */}
          {lastPt && <circle cx={toX(lastPt.time)} cy={toY(lastPt.price)} r={3.5} fill="#ff6b6b" />}

          {/* Current price dashed reference line */}
          <line
            x1={padL} y1={curY} x2={padL + plotW} y2={curY}
            stroke="#ef4444" strokeWidth={0.75} strokeDasharray="4,3" opacity={0.4}
          />
        </g>

        {/* Time axis labels and vertical gridlines */}
        {timeLabels.map((tl, i) => (
          <g key={i}>
            <line x1={tl.x} y1={padT} x2={tl.x} y2={padT + plotH} stroke="#334155" strokeWidth={0.5} strokeDasharray="3,4" opacity={0.4} />
            <text x={tl.x} y={padT + plotH + 16} textAnchor="middle" dominantBaseline="middle"
              fill="#64748b" fontSize={10} fontFamily="Inter, sans-serif">
              {tl.label}
            </text>
          </g>
        ))}

        {/* Draggable MAX handle */}
        <g onPointerDown={handlePointerDown('max')} style={{ cursor: 'ns-resize' }}>
          <rect x={handleCx - handleBarW / 2 - 30} y={selMaxY - handleHitH / 2} width={handleBarW + 60} height={handleHitH} fill="transparent" />
          <rect x={handleCx - handleBarW / 2} y={selMaxY - handleBarH / 2} width={handleBarW} height={handleBarH} rx={handleBarH / 2}
            fill={dragging === 'max' ? '#a5b4fc' : '#6366f1'} />
        </g>

        {/* Draggable MIN handle */}
        <g onPointerDown={handlePointerDown('min')} style={{ cursor: 'ns-resize' }}>
          <rect x={handleCx - handleBarW / 2 - 30} y={selMinY - handleHitH / 2} width={handleBarW + 60} height={handleHitH} fill="transparent" />
          <rect x={handleCx - handleBarW / 2} y={selMinY - handleBarH / 2} width={handleBarW} height={handleBarH} rx={handleBarH / 2}
            fill={dragging === 'min' ? '#a5b4fc' : '#6366f1'} />
        </g>

        {/* Current price pill */}
        <g>
          <rect x={padL + plotW - 64} y={curY - 10} width={52} height={20} rx={4} fill="#ef4444" />
          <text x={padL + plotW - 38} y={curY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(currentPrice)}
          </text>
        </g>

        {/* Selected max price label */}
        <g>
          <rect x={padL + plotW - 64} y={selMaxY - 10} width={52} height={20} rx={10} fill="#6366f1" />
          <text x={padL + plotW - 38} y={selMaxY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(selectedMax)}
          </text>
        </g>

        {/* Selected min price label */}
        <g>
          <rect x={padL + plotW - 64} y={selMinY - 10} width={52} height={20} rx={10} fill="#6366f1" />
          <text x={padL + plotW - 38} y={selMinY + 1} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={10} fontWeight={600} fontFamily="Inter, sans-serif">
            {fmtPrice(selectedMin)}
          </text>
        </g>

        {/* Y axis price labels (left side) */}
        {yTicks.map((p) => (
          <text key={p} x={padL - 6} y={toY(p)} textAnchor="end" dominantBaseline="middle"
            fill="#64748b" fontSize={11} fontFamily="Inter, sans-serif">
            {fmtPrice(p)}
          </text>
        ))}

        {/* Hover tooltip */}
        {!dragging && hoveredBin && (() => {
          const by = toY(hoveredBin.price + tickSpacing / 2);
          const pct = (hoveredBin.probability * 100);
          const tipW = 100, tipH = 32;
          const ratio = hoveredBin.probability / maxProb;
          const barEndX = padL + Math.max(ratio * plotW * 0.85, 1.5);
          let tx = barEndX + 8;
          if (tx + tipW > padL + plotW) tx = barEndX - tipW - 8;
          let ty = by - tipH / 2;
          if (ty < padT) ty = padT;
          if (ty + tipH > padT + plotH) ty = padT + plotH - tipH;
          return (
            <g>
              <rect x={tx} y={ty} width={tipW} height={tipH} rx={4} fill="#1e293b" opacity={0.95} />
              <text x={tx + tipW / 2} y={ty + 12} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight={600} fontFamily="Inter, sans-serif">
                {fmtPrice(hoveredBin.price)} – {fmtPrice(hoveredBin.price + tickSpacing)}
              </text>
              <text x={tx + tipW / 2} y={ty + 25} textAnchor="middle" fill="#94a3b8" fontSize={10} fontFamily="Inter, sans-serif">
                {pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% probability
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// --- Position Card (compact card for positions grid) ---
const CLOSE_SLIPPAGE_BPS = 200n; // 2% slippage protection on close

function PositionCard({ position: p, tickDivisor = 1 }: { position: PositionDisplay; tickDivisor?: number }) {
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const { step, txHash, error: execError, closePosition, claimPayout, reset } = useOptionsTrading();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;
  const prevStepRef = useRef(step);

  const isFinalized =
    p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary;
  const canClose = p.marketState === MarketState.Trading && !p.claimed;
  const canClaim = isFinalized && !p.claimed && p.isWinner === true;
  const isLoser = isFinalized && p.isWinner === false;

  // PNL calculation — after settlement, use actual payout (quantity for winners, 0 for losers)
  const hasCostBasis = p.costBasis > 0n;
  const effectiveValue = isLoser ? 0n : canClaim ? p.quantity : p.currentValue;
  const pnl = hasCostBasis ? Number(effectiveValue - p.costBasis) / 1e6 : null;
  const pnlPct = hasCostBasis && p.costBasis > 0n
    ? ((Number(effectiveValue) / Number(p.costBasis)) - 1) * 100
    : null;

  // Toast on success/error
  useEffect(() => {
    if (prevStepRef.current !== step) {
      const range = `${formatTickAsPrice(p.lowerTick, tickDivisor)} – ${formatTickAsPrice(p.upperTick, tickDivisor)}`;
      if (step === 'success' && (prevStepRef.current === 'closing' || prevStepRef.current === 'claiming')) {
        const valueStr = formatUsdc(p.currentValue);
        const pnlStr = pnl !== null
          ? ` (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`
          : '';
        const action = prevStepRef.current === 'closing' ? 'Position closed' : 'Payout claimed';
        toast.success(`${action}`, {
          description: `${range} — received ${valueStr}${pnlStr}`,
          duration: 5000,
        });
        // Auto-reset so the card shows "Close" again until it disappears on refetch
        setTimeout(() => reset(), 1500);
      } else if (step === 'error') {
        toast.error('Transaction failed', {
          description: execError || `Failed to close ${range}`,
          duration: 5000,
        });
      }
      prevStepRef.current = step;
    }
  }, [step, p, pnl, tickDivisor, execError, reset]);

  const handleAction = async () => {
    if (isWrongChain) { await switchForTab('options'); return; }
    if (step === 'error') { reset(); return; }
    if (canClaim) await claimPayout(p.positionId);
    else if (canClose) {
      const minProceeds = p.currentValue > 0n
        ? (p.currentValue * (10000n - CLOSE_SLIPPAGE_BPS)) / 10000n
        : 0n;
      await closePosition(p.positionId, minProceeds);
    }
  };

  const getActionLabel = () => {
    if (isWrongChain) return 'Switch';
    if (step === 'closing') return 'Closing…';
    if (step === 'claiming') return 'Claiming…';
    if (step === 'success') return 'Done';
    if (step === 'error') return 'Retry';
    if (canClaim) return 'Claim';
    if (canClose) return 'Close';
    return '';
  };

  const isActionDisabled = step === 'closing' || step === 'claiming' || step === 'success';
  const isBusy = step === 'closing' || step === 'claiming' || isSwitching;
  const qty = Number(p.quantity) / 1e6;

  const pnlColor = pnl !== null ? (pnl >= 0 ? '#4dff88' : '#ff4d4d') : undefined;
  const valueUsd = Number(effectiveValue) / 1e6;

  return (
    <div className="bg-[#111631] border border-white/[0.08] rounded-xl p-3.5 hover:border-[#8be4ff]/20 transition-colors relative overflow-hidden">
      {/* Subtle PNL accent bar at top */}
      {pnlColor && (
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: pnlColor, opacity: 0.5 }} />
      )}

      {/* Row 1: Range + PNL % badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#8be4ff] tabular-nums" style={{ ...FONT, fontSize: '13px', fontWeight: 600 }}>
          {formatTickAsPrice(p.lowerTick, tickDivisor)} – {formatTickAsPrice(p.upperTick, tickDivisor)}
        </span>
        {pnlPct !== null ? (
          <span
            className="tabular-nums px-1.5 py-0.5 rounded"
            style={{
              ...FONT,
              fontSize: '11px',
              fontWeight: 600,
              color: pnlColor,
              backgroundColor: pnl! >= 0 ? 'rgba(77,255,136,0.1)' : 'rgba(255,77,77,0.1)',
            }}
          >
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(0)}%
          </span>
        ) : (
          <span className="text-slate-600 tabular-nums" style={{ ...FONT, fontSize: '11px' }}>
            #{p.positionId}
          </span>
        )}
      </div>

      {/* Row 2: Big value + PNL dollar amount */}
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-white tabular-nums font-semibold" style={{ ...FONT, fontSize: '18px' }}>
          {formatUsdc(effectiveValue)}
        </span>
        {pnl !== null && (
          <span className="tabular-nums" style={{ ...FONT, fontSize: '12px', color: pnlColor }}>
            {pnl >= 0 ? '+' : ''}{Math.abs(pnl) < 0.01 ? pnl.toFixed(4) : `$${pnl.toFixed(2)}`}
          </span>
        )}
      </div>

      {/* Row 3: Cost basis (subtle) + Action */}
      <div className="flex items-center justify-between">
        <span className="text-slate-500 tabular-nums" style={{ ...FONT, fontSize: '11px' }}>
          {hasCostBasis ? `Cost ${formatUsdc(p.costBasis)}` : `#${p.positionId}`}
        </span>
        {(canClose || canClaim) && (
          <button
            onClick={handleAction}
            disabled={isActionDisabled}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
              isActionDisabled
                ? 'bg-white/5 text-slate-600 cursor-not-allowed'
                : canClaim
                  ? 'bg-[#8be4ff]/10 text-[#8be4ff] hover:bg-[#8be4ff]/20'
                  : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.12] hover:text-white',
            )}
            style={{ ...FONT, fontSize: '12px' }}
          >
            {isBusy && <span className="w-2.5 h-2.5 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />}
            {getActionLabel()}
          </button>
        )}
        {isLoser && (
          <span className="px-3 py-1 rounded-md bg-red-500/10 text-red-400 font-medium" style={{ ...FONT, fontSize: '12px' }}>Lost</span>
        )}
        {p.claimed && (
          <span className="text-slate-600" style={{ ...FONT, fontSize: '12px' }}>Claimed</span>
        )}
      </div>
    </div>
  );
}

// ========== MAIN COMPONENT ==========

export function OptionsTradePage() {
  const { login } = useLogin();
  const { authenticated, logout } = usePrivy();
  const { marketId: marketIdParam } = useParams<{ marketId: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();

  const handleLogin = useCallback(async () => {
    if (authenticated) {
      await logout();
    }
    login();
  }, [authenticated, logout, login]);
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const { step, txHash, error: execError, openPosition, reset } = useOptionsTrading();

  const { markets, loading: marketsLoading } = useOptionsMarkets();
  const { positions, loading: positionsLoading } = useOptionsPositions();
  const marketId = Number(marketIdParam);
  const market = markets.find((m) => m.marketId === marketId) ?? null;

  // Live price + chart (dynamic per asset)
  const { price: currentPrice } = useRedstonePrice(market?.feedId ?? 'AVAX');
  const [chartTimeframe, setChartTimeframe] = useState(1440); // minutes: 15, 60, 240, 1440
  const { data: chartData } = useAssetChartData(market?.coingeckoId ?? null, chartTimeframe, market?.feedId);

  // Tick divisor for this market (1 = dollar ticks, 100 = cent ticks)
  const tickDivisor = market?.tickDivisor ?? 1;

  // Bin probabilities
  const { bins, mostLikelyPrice, loading: binsLoading } = useBinProbabilities({
    marketId,
    minTick: market?.minTick ?? 0n,
    maxTick: market?.maxTick ?? 0n,
    tickSpacing: market?.tickSpacing ?? 1n,
    marketState: market?.state ?? MarketState.PendingOps,
    tickDivisor,
  });

  // Countdown
  const { formatted: countdown, expired } = useCountdown(market?.tradingEnd ?? 0);

  // Trade form state
  const [lowerTick, setLowerTick] = useState<bigint | null>(null);
  const [upperTick, setUpperTick] = useState<bigint | null>(null);
  const [spendInput, setSpendInput] = useState('');
  const [slippage, setSlippage] = useState(100);
  const [showSettings, setShowSettings] = useState(false);

  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const availableTicks = useMemo(() => {
    if (!market) return [];
    return generateTicks(market.minTick, market.maxTick, market.tickSpacing);
  }, [market]);

  // Initialize tick range centered near current price (wait for price to load)
  useEffect(() => {
    if (market && lowerTick === null && upperTick === null && currentPrice > 0) {
      const spacing = market.tickSpacing;
      const rawPrice = BigInt(Math.round(currentPrice * tickDivisor));
      // Snap to nearest tick
      const center = (rawPrice / spacing) * spacing;
      // Spread ~3 ticks above and below
      const spread = spacing * 3n;
      const lo = center - spread < market.minTick ? market.minTick : center - spread;
      const hi = center + spread > market.maxTick ? market.maxTick : center + spread;
      setLowerTick(lo);
      setUpperTick(hi);
    }
  }, [market, lowerTick, upperTick, currentPrice, tickDivisor]);

  // Reset form when market changes
  useEffect(() => {
    setLowerTick(null);
    setUpperTick(null);
    setSpendInput('');
    setShowSettings(false);
    reset();
  }, [marketId, reset]);

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: OPTIONS_CONTRACTS.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.FUJI,
    query: { enabled: !!address },
  });

  // Spend → quantity + cost: single binary search inside React Query (no flickering)
  const { quantity: resolvedQty, cost, maxSpend, loading: costLoading, error: costError } = useSpendToQuantity({
    marketId: market?.marketId ?? 0,
    lowerTick,
    upperTick,
    spendUsdc: spendInput,
  });

  // maxCost = actual converged cost + slippage buffer
  // Must be >= actual cost or contract reverts. Don't cap below converged cost.
  const maxCost = useMemo(() => {
    if (!cost) return null;
    return (cost * (10000n + BigInt(slippage))) / 10000n;
  }, [cost, slippage]);

  const hasInsufficientBalance = useMemo(() => {
    if (!maxCost || usdcBalance === undefined) return false;
    return maxCost > (usdcBalance as bigint);
  }, [maxCost, usdcBalance]);

  // Win probability: sum of probabilities for selected bins
  const winProbability = useMemo(() => {
    if (!bins.length || lowerTick === null || upperTick === null) return 0;
    return bins
      .filter((b) => b.tick >= lowerTick && b.tick < upperTick)
      .reduce((sum, b) => sum + b.probability, 0);
  }, [bins, lowerTick, upperTick]);

  // Average price per share (cost / resolvedQty)
  const avgPrice = useMemo(() => {
    if (!cost || resolvedQty <= 0) return 0;
    return Number(cost) / 1e6 / resolvedQty;
  }, [cost, resolvedQty]);

  // Payout if win = resolvedQty (1 USDC per unit)
  const receiveIfWin = resolvedQty;
  const payoutMultiplier = useMemo(() => {
    if (!cost || resolvedQty <= 0) return 0;
    const costUsd = Number(cost) / 1e6;
    return costUsd > 0 ? resolvedQty / costUsd : 0;
  }, [cost, resolvedQty]);

  // Last hour sparkline data from chart data (works for both CoinGecko and Redstone)
  const lastHourData = useMemo(
    () => chartData.filter((d) => d.time > Date.now() - 3600_000),
    [chartData],
  );

  // Keyboard handler for range control
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!market || lowerTick === null || upperTick === null) return;
      const ts = market.tickSpacing;
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if (!isArrow) return;
      e.preventDefault();

      if (e.shiftKey) {
        // Expand/contract range
        if (e.key === 'ArrowUp' && upperTick + ts <= market.maxTick) {
          setUpperTick(upperTick + ts);
        } else if (e.key === 'ArrowDown' && lowerTick - ts >= market.minTick) {
          setLowerTick(lowerTick - ts);
        }
      } else {
        // Shift entire range
        if (e.key === 'ArrowUp' && upperTick + ts <= market.maxTick) {
          setLowerTick(lowerTick + ts);
          setUpperTick(upperTick + ts);
        } else if (e.key === 'ArrowDown' && lowerTick - ts >= market.minTick) {
          setLowerTick(lowerTick - ts);
          setUpperTick(upperTick - ts);
        }
      }
    },
    [market, lowerTick, upperTick],
  );

  // Positions filtered to this market
  const marketPositions = useMemo(
    () => positions.filter((p) => p.marketId === marketId),
    [positions, marketId],
  );

  const handleOpenClick = useCallback(async () => {
    if (!isConnected) {
      handleLogin();
      return;
    }
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (!market || lowerTick === null || upperTick === null || !maxCost) return;

    const qtyMicro = BigInt(Math.round(resolvedQty * 1e6));
    if (qtyMicro <= 0n) return;

    await openPosition({
      marketId: market.marketId,
      lowerTick,
      upperTick,
      quantity: qtyMicro,
      maxCost,
    });
  }, [isConnected, isWrongChain, market, lowerTick, upperTick, maxCost, resolvedQty, switchForTab, openPosition, handleLogin]);

  const getButtonText = () => {
    if (!isConnected) return 'Sign In';
    if (isWrongChain) return 'Switch Network';
    if (lowerTick === null || upperTick === null) return 'Select Range';
    if (!spendInput || spendInput === '0') return 'Enter Amount';
    if (costLoading) return 'Calculating...';
    if (costError) return 'Cost Error';
    if (hasInsufficientBalance) return 'Insufficient USDC';
    if (step === 'approving') return 'Approving USDC...';
    if (step === 'opening') return 'Opening Position...';
    if (step === 'success') return 'Success!';
    if (step === 'error') return 'Try Again';
    return 'Open Position';
  };

  const isButtonDisabled = () => {
    if (!isConnected) return false;
    if (isWrongChain) return false;
    if (lowerTick === null || upperTick === null) return true;
    if (!spendInput || spendInput === '0') return true;
    if (costLoading) return true;
    if (costError) return true;
    if (hasInsufficientBalance) return true;
    if (!cost) return true;
    if (step === 'approving' || step === 'opening') return true;
    return false;
  };

  // Loading
  if (marketsLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-white/10 rounded" />
          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            <div className="h-[500px] bg-white/10 rounded-2xl" />
            <div className="h-[500px] bg-white/10 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (!market) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
        <button
          onClick={() => navigate('/options')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
          style={{ ...FONT, fontSize: '14px' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </button>
        <div className="flex items-center justify-center p-12 text-slate-500" style={{ ...FONT, fontSize: '15px' }}>
          Market not found
        </div>
      </div>
    );
  }

  return (
    <div>
    {/* Success popup overlay */}
    {step === 'success' && txHash && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            reset();
            setSpendInput('');
          }}
        />
        {/* Modal */}
        <div className="relative border border-white/10 bg-[#0d1129] rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
          <div className="w-14 h-14 mx-auto mb-4 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Check className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-white font-medium mb-1.5" style={{ ...FONT, fontSize: '17px' }}>
            Position Opened
          </h2>
          <p className="text-slate-400 mb-4" style={{ ...FONT, fontSize: '13px' }}>
            Market #{marketId} — {formatTickAsPrice(lowerTick ?? 0n, tickDivisor)} to {formatTickAsPrice(upperTick ?? 0n, tickDivisor)}
          </p>
          <a
            href={`https://testnet.snowtrace.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors mb-5"
            style={{ ...FONT, fontSize: '12px' }}
          >
            View on Snowtrace <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/options')}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
              style={{ ...FONT, fontSize: '13px' }}
            >
              Markets
            </button>
            <button
              onClick={() => {
                reset();
                setSpendInput('');
                  }}
              className="flex-1 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-xl font-medium transition-colors"
              style={{ ...FONT, fontSize: '13px' }}
            >
              Trade Again
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/options')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        style={{ ...FONT, fontSize: '14px' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </button>

      {/* Two-panel layout */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* ===== LEFT PANEL — Chart Area ===== */}
        <div className="border border-white/10 bg-white/[0.02] rounded-2xl overflow-hidden">
          {/* Market Header */}
          <div className="p-5 md:p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <AssetLogo src={market.assetLogo} symbol={market.assetSymbol} size={40} />
              <div>
                <h1 className="text-white font-medium flex items-center gap-2" style={{ ...FONT, fontSize: '18px' }}>
                  {market.assetSymbol}/USD
                  <span className="text-slate-500 font-normal" style={{ fontSize: '14px' }}>
                    {market.assetName}
                  </span>
                </h1>
                <div className="text-slate-500 mt-0.5" style={{ ...FONT, fontSize: '13px' }}>
                  {formatDate(market.settlementTimestamp || market.tradingEnd)} · Settlement at {formatTime(market.settlementTimestamp || market.tradingEnd)}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">
            <div className="p-4 md:p-5">
              <div className="text-slate-500 mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Current Price
                <InfoTip text={`Live ${market.assetSymbol} price from Redstone oracle. This is the reference price — if it lands in your range at settlement, you win.`} />
              </div>
              <div className="text-red-500 font-semibold flex items-center gap-2" style={{ ...FONT, fontSize: '20px' }}>
                {market.priceDecimals === 0 ? `$${Math.round(currentPrice).toLocaleString()}` : `$${currentPrice.toFixed(2)}`}
                {lastHourData.length > 1 && <MiniSparkline data={lastHourData} />}
              </div>
            </div>
            <div className="p-4 md:p-5">
              <div className="text-slate-500 mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Most Likely
                <InfoTip text="The price bin with the highest probability based on current market trading activity. Updates as traders buy and sell." />
              </div>
              <div className="text-green-400 font-semibold" style={{ ...FONT, fontSize: '20px' }}>
                {binsLoading ? (
                  <span className="text-slate-600">...</span>
                ) : mostLikelyPrice === null ? (
                  <span className="text-slate-500">&mdash;</span>
                ) : (
                  market.priceDecimals === 0 ? `$${Math.round(mostLikelyPrice).toLocaleString()}` : `$${mostLikelyPrice.toFixed(2)}`
                )}
              </div>
            </div>
            <div className="p-4 md:p-5">
              <div className="text-slate-500 mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {expired ? 'Ended' : 'Ends In'}
                <InfoTip text="Time remaining until trading closes. After this, the oracle reports the settlement price and winning positions can claim payouts." />
              </div>
              <div className="text-white font-semibold font-mono" style={{ fontSize: '20px' }}>
                {expired ? 'Closed' : countdown}
              </div>
              {!expired && market && (() => {
                const now = Date.now() / 1000;
                const total = market.tradingEnd - market.tradingStart;
                const pct = total <= 0 ? 100 : Math.max(0, Math.min(100, ((now - market.tradingStart) / total) * 100));
                const color = pct < 50 ? '#4ade80' : pct < 80 ? '#fbbf24' : '#ef4444';
                return (
                  <div className="h-1 rounded-full bg-white/10 mt-2">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Market Chart Chart */}
          <div
            className="p-4 md:p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:rounded-lg"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            {/* Chart header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold" style={{ ...FONT, fontSize: '16px' }}>
                  Market Chart
                  <InfoTip text="Price history with probability bars for each bin. Taller bars = more likely. Drag the blue handles to set your range. Use arrow keys to adjust." />
                </span>
                <div className="flex items-center gap-1">
                  {([
                    { label: '15m', value: 15 },
                    { label: '1H', value: 60 },
                    { label: '4H', value: 240 },
                    { label: '1D', value: 1440 },
                  ] as const).map((tf) => (
                    <button
                      key={tf.value}
                      onClick={() => setChartTimeframe(tf.value)}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs transition-colors',
                        chartTimeframe === tf.value
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800',
                      )}
                      style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-slate-500" style={{ ...FONT, fontSize: '12px' }}>
                {market.numBins} bins · ${Number(market.tickSpacing) / tickDivisor > 1 ? (Number(market.tickSpacing) / tickDivisor).toLocaleString() : (Number(market.tickSpacing) / tickDivisor).toFixed(2)} each
              </span>
            </div>

            {binsLoading ? (
              <div className="h-[420px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
              </div>
            ) : (
              <>
                <PriceDistributionChart
                  bins={bins}
                  chartData={chartData}
                  currentPrice={currentPrice}
                  selectedMin={Number(lowerTick ?? market.minTick) / tickDivisor}
                  selectedMax={Number(upperTick ?? market.maxTick) / tickDivisor}
                  minPrice={market.minPrice}
                  maxPrice={market.maxPrice}
                  tickSpacing={Number(market.tickSpacing) / tickDivisor}
                  numBins={market.numBins}
                  priceDecimals={market.priceDecimals}
                  timeframeMinutes={chartTimeframe}
                  onRangeChange={(newMin, newMax) => {
                    setLowerTick(BigInt(Math.round(newMin * tickDivisor)));
                    setUpperTick(BigInt(Math.round(newMax * tickDivisor)));
                  }}
                />
                {bins.length > 0 && (
                  <div className="mt-2 text-center" style={{ ...FONT, fontSize: '13px' }}>
                    <span className="text-slate-500">Your range captures </span>
                    <span className="text-indigo-400 font-medium">{(winProbability * 100).toFixed(1)}%</span>
                    <span className="text-slate-500"> probability</span>
                  </div>
                )}

              </>
            )}
          </div>
        </div>

        {/* ===== RIGHT PANEL — Trade Form ===== */}
        <div className="border border-white/10 bg-white/[0.02] rounded-2xl overflow-hidden flex flex-col">
          <div className="flex-1 flex flex-col">
            <div className="p-5 space-y-5 flex-1">
                {/* Slippage settings button */}
                <div className="flex items-center justify-between">
                  <div className="text-slate-500" style={{ ...FONT, fontSize: '12px' }}>
                    Price ranges in ${Number(market.tickSpacing) / tickDivisor > 1 ? (Number(market.tickSpacing) / tickDivisor).toLocaleString() : (Number(market.tickSpacing) / tickDivisor).toFixed(2)} increments
                  </div>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      showSettings ? 'text-white bg-white/10' : 'text-slate-500 hover:text-white hover:bg-white/5',
                    )}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {/* Slippage settings */}
                {showSettings && (
                  <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                    <div className="text-slate-500 mb-2" style={{ ...FONT, fontSize: '12px' }}>
                      Max Cost Slippage
                      <InfoTip text="Maximum extra cost you're willing to pay if prices shift between submitting and execution. Higher = less likely to fail." />
                    </div>
                    <div className="flex gap-2">
                      {SLIPPAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSlippage(opt.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg transition-all font-medium',
                            slippage === opt.value ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-400 hover:text-white',
                          )}
                          style={{ ...FONT, fontSize: '13px' }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preset range buttons */}
                {currentPrice > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {RANGE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          const centerTick = (BigInt(Math.round(currentPrice * tickDivisor)) / market.tickSpacing) * market.tickSpacing;
                          let spreadTicks = BigInt(Math.round(currentPrice * tickDivisor * preset.pct / Number(market.tickSpacing))) * market.tickSpacing;
                          if (spreadTicks < market.tickSpacing) spreadTicks = market.tickSpacing;
                          const lo = centerTick - spreadTicks < market.minTick ? market.minTick : centerTick - spreadTicks;
                          const hi = centerTick + spreadTicks > market.maxTick ? market.maxTick : centerTick + spreadTicks;
                          setLowerTick(lo);
                          setUpperTick(hi);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Min Price / Max Price steppers */}
                <div className="flex gap-3">
                  <TickStepper
                    label="Min Price"
                    value={lowerTick ?? market.minTick}
                    onChange={(v) => {
                      setLowerTick(v);
                      if (upperTick !== null && v >= upperTick) {
                        setUpperTick(v + market.tickSpacing);
                      }
                    }}
                    min={market.minTick}
                    max={market.maxTick - market.tickSpacing}
                    step={market.tickSpacing}
                    tickDivisor={tickDivisor}
                  />
                  <TickStepper
                    label="Max Price"
                    value={upperTick ?? market.maxTick}
                    onChange={(v) => {
                      setUpperTick(v);
                      if (lowerTick !== null && v <= lowerTick) {
                        setLowerTick(v - market.tickSpacing);
                      }
                    }}
                    min={market.minTick + market.tickSpacing}
                    max={market.maxTick}
                    step={market.tickSpacing}
                    tickDivisor={tickDivisor}
                  />
                </div>

                {/* Win Probability / Avg Price */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <div className="text-slate-500 mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Win Prob
                      <InfoTip text="Sum of probabilities for all bins in your selected range. Higher = more likely to win, but costs more per share." />
                    </div>
                    <div className="text-white font-semibold" style={{ ...FONT, fontSize: '18px' }}>
                      {binsLoading ? '...' : `${(winProbability * 100).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <div className="text-slate-500 mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Avg Price
                      <InfoTip text="Cost per share (payout unit). If you win, each share pays $1. Lower avg price = higher potential return." />
                    </div>
                    <div className="text-white font-semibold" style={{ ...FONT, fontSize: '18px' }}>
                      {costLoading ? '...' : avgPrice > 0 ? `$${avgPrice.toFixed(2)}` : '-'}
                    </div>
                  </div>
                </div>

                {/* Spend input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-500" style={{ ...FONT, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      You Pay (USDC)
                      <InfoTip text="How much USDC you want to spend. If the settlement price lands in your range, you win a payout. If not, you lose this amount." />
                    </span>
                    {usdcBalance !== undefined && (
                      <button
                        onClick={() => {
                          const bal = Number(usdcBalance as bigint) / 1e6;
                          setSpendInput(bal.toFixed(2));
                        }}
                        className="text-slate-600 hover:text-white transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <input
                      type="text"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-white text-right focus:outline-none font-medium text-xl"
                      style={FONT}
                    />
                  </div>
                  {usdcBalance !== undefined && (
                    <div className="text-slate-600 mt-1" style={{ ...FONT, fontSize: '11px' }}>
                      Balance: {formatUsdc(usdcBalance as bigint)}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-1.5">
                    {AMOUNT_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setSpendInput(amt.toString())}
                        className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        ${amt}
                      </button>
                    ))}
                    {usdcBalance !== undefined && (
                      <button
                        onClick={() => {
                          const bal = Number(usdcBalance as bigint) / 1e6;
                          setSpendInput(bal.toFixed(2));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>

                {/* Max spend warning */}
                {maxSpend !== null && !costLoading && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-amber-400" style={{ ...FONT, fontSize: '12px' }}>
                      Max spend for this range is <strong>${maxSpend.toFixed(2)}</strong> (market liquidity limit).
                    </span>
                  </div>
                )}

                {/* Payout summary */}
                {resolvedQty > 0 && cost && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500" style={{ ...FONT, fontSize: '12px' }}>
                        Payout if Win
                        <InfoTip text="Total USDC you receive if the settlement price lands inside your range. The multiplier shows your return vs. cost." />
                      </span>
                      <span className="text-green-400 font-medium" style={{ ...FONT, fontSize: '13px' }}>
                        {costLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : (
                          <>
                            ${receiveIfWin.toFixed(2)}
                            {payoutMultiplier > 0 && (
                              <span className="text-slate-500 ml-1.5 font-normal">×{payoutMultiplier.toFixed(1)}</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500" style={{ ...FONT, fontSize: '12px' }}>
                        Est. Cost
                        <InfoTip text="Actual cost calculated by the smart contract. May differ slightly from your input due to CLMSR pricing dynamics." />
                      </span>
                      <span className="text-white" style={{ ...FONT, fontSize: '13px' }}>
                        {costLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : formatUsdc(cost)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {(costError || execError) && (
                <div className="px-5 pb-3">
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-red-500" style={{ ...FONT, fontSize: '13px' }}>
                      {costError || execError}
                    </span>
                  </div>
                </div>
              )}

              {/* Action button */}
              <div className="p-5 pt-0">
                <button
                  onClick={handleOpenClick}
                  disabled={isButtonDisabled()}
                  className={cn(
                    'w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2.5',
                    hasInsufficientBalance
                      ? 'bg-red-500/10 text-red-500 cursor-not-allowed'
                      : isButtonDisabled()
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600',
                  )}
                  style={{ ...FONT, fontSize: '15px' }}
                >
                  {(step === 'approving' || step === 'opening' || isSwitching) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {getButtonText()}
                </button>
              </div>

              {/* Pending tx link */}
              {txHash && (step === 'opening' || step === 'approving') && (
                <div className="px-5 pb-5 text-center">
                  <a
                    href={`https://testnet.snowtrace.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                    style={{ ...FONT, fontSize: '12px' }}
                  >
                    View Transaction <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== POSITIONS — spans both columns ===== */}
        {isConnected && marketPositions.length > 0 && (
          <div className="lg:col-span-2 mt-2">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-white font-medium" style={{ ...FONT, fontSize: '14px' }}>
                Your Positions
              </span>
              <span className="text-slate-500" style={{ ...FONT, fontSize: '12px' }}>
                ({marketPositions.length})
              </span>
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {marketPositions.map((p) => (
                <PositionCard key={p.positionId} position={p} tickDivisor={tickDivisor} />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
