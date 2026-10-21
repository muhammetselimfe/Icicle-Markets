import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useSyncedOracle } from '@/app/hooks/useSyncedOracle';
import { useBinExposure, rangeHeadroom } from '@/app/hooks/useBinExposure';
import { MarketState } from '@/app/types/options';
import { formatTickAsPrice, formatUsdc } from '@/app/utils/options';
import { PriceDistributionChart } from '@/app/components/options/price-distribution-chart';
import { PositionCard, ClaimAllButton } from '@/app/components/options/trade-position-card';

const SLIPPAGE_OPTIONS = [
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '3%', value: 300 },
];

const FONT = { fontFamily: 'Inter, sans-serif' };

const AMOUNT_PRESETS = [5, 10, 25];

// Range presets in BINS around the bin that contains the current price. Percent presets
// were far too wide for short markets (±1 % on a 15-min AVAX market is already 4 bins).
const RANGE_PRESETS = [
  { label: 'Current bin', bins: 0 },
  { label: '±1 bin', bins: 1 },
  { label: '±2 bins', bins: 2 },
  { label: '±5 bins', bins: 5 },
];

/** Small 1 s clock for "x s ago" style labels */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

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
        className="rounded-full bg-ice-line/[0.08] flex items-center justify-center text-ice-text font-bold shrink-0"
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
        <button type="button" className="inline-flex align-middle ml-1 text-ice-faint hover:text-ice-muted transition-colors">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[220px] bg-[#1e293b] text-ice-muted border border-ice-line/15 px-3 py-2 text-xs leading-relaxed"
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
      <div className="text-ice-faint mb-1.5" style={{ ...FONT, fontSize: '12px' }}>
        {label}
      </div>
      <div className="flex items-center gap-0 bg-ice-surface2 rounded-xl overflow-hidden">
        <div className="flex-1 px-3 py-2.5 text-ice-text font-medium text-center" style={{ ...FONT, fontSize: '15px' }}>
          {formatTickAsPrice(value, tickDivisor)}
        </div>
        <div className="flex flex-col border-l border-ice-line/15">
          <button
            onClick={() => value + step <= max && onChange(value + step)}
            disabled={value + step > max}
            className="px-2 py-1 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.06] transition-colors disabled:opacity-30"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => value - step >= min && onChange(value - step)}
            disabled={value - step < min}
            className="px-2 py-1 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.06] transition-colors disabled:opacity-30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
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
  const { positions } = useOptionsPositions();
  const marketId = Number(marketIdParam);
  const market = markets.find((m) => m.marketId === marketId) ?? null;

  // Live price + chart (dynamic per asset)
  const { price: currentPrice, timestamp: priceTs } = useRedstonePrice(market?.feedId ?? 'AVAX');
  const nowMs = useNow();
  const priceAgeSec = priceTs > 0 ? Math.max(0, Math.round(nowMs / 1000 - priceTs)) : null;
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

  // Open units per bin (the per-bin exposure cap counts units): tells the user how much a
  // range can still take BEFORE the contract rejects the order.
  // The contract prices against its last SYNCED oracle tick, not the live price shown above.
  // Between refreshes the two can sit in different bins; say so instead of showing odds that
  // look wrong for the "current" bin.
  const { syncedTick, syncedTs } = useSyncedOracle({ marketId, enabled: !!market && !market.settled });
  const syncedPrice = syncedTick !== null && market ? Number(syncedTick) / market.tickDivisor : null;
  const syncedAgeSec = syncedTs > 0 ? Math.max(0, Math.round(nowMs / 1000 - syncedTs)) : null;
  const syncGap = (() => {
    if (!market || syncedTick === null || syncedTs === 0 || currentPrice <= 0) return false;
    const ts = market.tickSpacing;
    const liveBin = (BigInt(Math.round(currentPrice * market.tickDivisor)) - market.minTick) / ts;
    const syncedBin = (syncedTick - market.minTick) / ts;
    return liveBin !== syncedBin;
  })();
  const { exposure } = useBinExposure({ marketId, tickSpacing: market?.tickSpacing ?? 0n, enabled: !!market && !market.settled });

  // Countdown
  const { formatted: countdown, expired } = useCountdown(market?.tradingEnd ?? 0);

  // Trade form state
  const [lowerTick, setLowerTick] = useState<bigint | null>(null);
  const [upperTick, setUpperTick] = useState<bigint | null>(null);
  const [spendInput, setSpendInput] = useState('');
  const [slippage, setSlippage] = useState(100);
  // Receipt of the last submitted order (shown inline on success instead of a modal)
  const [lastOrder, setLastOrder] = useState<{ lo: bigint; hi: bigint; units: number; paid: number; odds: number; perUnit: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

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

  // Default chart timeframe = the market's own life (a 15-min market on a 1D chart is one pixel wide)
  useEffect(() => {
    if (!market) return;
    const durationMin = (market.settlementTimestamp - market.tradingStart) / 60;
    setChartTimeframe(durationMin <= 30 ? 60 : durationMin <= 240 ? 240 : 1440);
  }, [market?.marketId, market?.tradingStart, market?.settlementTimestamp]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Quote the user's amount, or a $10 preview when the field is empty, so the panel
  // always shows a payout and a price-impact figure for the selected range.
  const PREVIEW_SPEND = '10';
  const isPreview = !spendInput || spendInput === '0' || Number(spendInput) <= 0;
  const headroomUnits = useMemo(() => {
    if (!market) return null;
    const h = rangeHeadroom(exposure, market.perBinCap, lowerTick, upperTick, market.tickSpacing);
    return h === null ? null : Number(h) / 1e6;
  }, [exposure, market, lowerTick, upperTick]);
  const { quantity: resolvedQty, cost, maxSpend, limitedBy, loading: costLoading, error: costError } = useSpendToQuantity({
    marketId: market?.marketId ?? 0,
    lowerTick,
    upperTick,
    spendUsdc: isPreview ? PREVIEW_SPEND : spendInput,
    maxUnits: headroomUnits,
  });

  // maxCost = actual converged cost + slippage buffer + view/execute mismatch buffer
  // The contract's calculateOpenCost (view) and openPosition (execute) use different
  // cost computation paths: view uses theoretical calculation, execute uses chunked
  // factor application. This creates a ~1-2% cost mismatch for larger positions.
  // We add 200bps (2%) safety margin on top of user slippage to cover this.
  const VIEW_EXECUTE_BUFFER_BPS = 200n;
  const maxCost = useMemo(() => {
    if (!cost) return null;
    return (cost * (10000n + BigInt(slippage) + VIEW_EXECUTE_BUFFER_BPS)) / 10000n;
  }, [cost, slippage]);

  const hasInsufficientBalance = useMemo(() => {
    if (isPreview || !maxCost || usdcBalance === undefined) return false; // the $10 preview is not an order
    return maxCost > (usdcBalance as bigint);
  }, [isPreview, maxCost, usdcBalance]);

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

  // Price impact: the marginal odds after the trade ≈ 2·avg − before (the CLMSR cost is
  // convex, so the average price paid sits between the pre- and post-trade marginal price).
  const oddsAfter = useMemo(() => {
    if (avgPrice <= 0 || winProbability <= 0) return null;
    return Math.max(winProbability, Math.min(0.999, 2 * avgPrice - winProbability));
  }, [avgPrice, winProbability]);

  // Payout if win = resolvedQty (1 USDC per unit)
  const receiveIfWin = resolvedQty;
  const payoutMultiplier = useMemo(() => {
    if (!cost || resolvedQty <= 0) return 0;
    const costUsd = Number(cost) / 1e6;
    return costUsd > 0 ? resolvedQty / costUsd : 0;
  }, [cost, resolvedQty]);

  // Typical 1σ move between now and settlement, from the asset's daily volatility
  const typicalMove = useMemo(() => {
    if (!market || currentPrice <= 0) return null;
    const remaining = Math.max(0, market.settlementTimestamp - nowMs / 1000);
    const sigma = market.dailyVol * Math.sqrt(remaining / 86400) * currentPrice;
    return { abs: sigma, pct: currentPrice > 0 ? sigma / currentPrice : 0, bins: sigma / (Number(market.tickSpacing) / tickDivisor) };
  }, [market, currentPrice, nowMs, tickDivisor]);

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
    if (!market || lowerTick === null || upperTick === null || !maxCost || isPreview) return;

    const qtyMicro = BigInt(Math.round(resolvedQty * 1e6));
    if (qtyMicro <= 0n) return;
    setLastOrder({ lo: lowerTick, hi: upperTick, units: resolvedQty, paid: cost ? Number(cost) / 1e6 : 0, odds: winProbability, perUnit: avgPrice });

    console.log('[handleOpenClick] params:', {
      marketId: market.marketId,
      lowerTick: lowerTick.toString(),
      upperTick: upperTick.toString(),
      resolvedQty,
      qtyMicro: qtyMicro.toString(),
      maxCost: maxCost.toString(),
      tickDivisor,
    });

    await openPosition({
      marketId: market.marketId,
      lowerTick,
      upperTick,
      quantity: qtyMicro,
      maxCost,
      slippageBps: slippage,      // v2.1: re-quote right before sending
      feedId: market.feedId,      // v2.1: attach the signed price to the trade
    });
  }, [isConnected, isWrongChain, market, lowerTick, upperTick, maxCost, resolvedQty, slippage, isPreview, cost, winProbability, avgPrice, switchForTab, openPosition, handleLogin]);

  const getButtonText = () => {
    if (!isConnected) return 'Sign In';
    if (isWrongChain) return 'Switch Network';
    if (market?.tradingHalted) return 'Trading Paused';
    if (lowerTick === null || upperTick === null) return 'Select Range';
    if (!spendInput || spendInput === '0') return 'Enter Amount';
    if (costLoading) return 'Calculating...';
    if (costError) return 'Cost Error';
    if (hasInsufficientBalance) return 'Insufficient USDC';
    if (step === 'approving') return 'Approving USDC...';
    if (step === 'opening') return 'Opening Position...';
    if (step === 'success') return 'New Trade';
    if (step === 'error') return 'Try Again';
    return 'Open Position';
  };

  const isButtonDisabled = () => {
    if (!isConnected) return false;
    if (isWrongChain) return false;
    if (market?.tradingHalted) return true;
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
          <div className="h-8 w-48 bg-ice-line/[0.08] rounded" />
          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            <div className="h-[500px] bg-ice-line/[0.08] rounded-2xl" />
            <div className="h-[500px] bg-ice-line/[0.08] rounded-2xl" />
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
          onClick={() => navigate('/predict')}
          className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors mb-6"
          style={{ ...FONT, fontSize: '14px' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </button>
        <div className="flex items-center justify-center p-12 text-ice-faint" style={{ ...FONT, fontSize: '15px' }}>
          Market not found
        </div>
      </div>
    );
  }

  return (
    <div>
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-6xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/predict')}
        className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors mb-6"
        style={{ ...FONT, fontSize: '14px' }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </button>

      {/* Two-panel layout */}
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* ===== LEFT PANEL — Chart Area ===== */}
        <div className="border border-ice-line/15 bg-ice-surface rounded-2xl overflow-hidden">
          {/* Market Header */}
          <div className="p-4 md:p-5 border-b border-ice-line/15">
            <div className="flex items-center gap-3 min-w-0">
              <AssetLogo src={market.assetLogo} symbol={market.assetSymbol} size={36} />
              <div className="min-w-0">
                <h1 className="text-ice-text font-medium flex items-center gap-2 flex-wrap" style={{ ...FONT, fontSize: '18px' }}>
                  {market.assetSymbol}/USD
                  <span className="text-ice-faint font-normal" style={{ fontSize: '14px' }}>
                    {market.assetName}
                  </span>
                </h1>
                <div className="text-ice-faint mt-0.5" style={{ ...FONT, fontSize: '13px' }}>
                  {formatDate(market.settlementTimestamp || market.tradingEnd)} · Settlement at {formatTime(market.settlementTimestamp || market.tradingEnd)}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 divide-x divide-ice-line/15 border-b border-ice-line/15">
            <div className="p-3.5 md:p-4">
              <div className="text-ice-faint mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {market.settled ? 'Settlement Price' : 'Current Price'}
                <InfoTip text={market.settled
                  ? 'The oracle-reported price at settlement. The bin containing this price wins.'
                  : `Live ${market.assetSymbol} price from Redstone oracle. This is the reference price — if it lands in your range at settlement, you win.`
                } />
              </div>
              <div className={cn('font-semibold flex items-center gap-2', market.settled ? 'text-ice-text' : 'text-ice-down')} style={{ ...FONT, fontSize: '20px' }}>
                {market.settled && market.settlementPrice !== null
                  ? (market.priceDecimals === 0 ? `$${Math.round(market.settlementPrice).toLocaleString()}` : `$${market.settlementPrice.toFixed(2)}`)
                  : (market.priceDecimals === 0 ? `$${Math.round(currentPrice).toLocaleString()}` : `$${currentPrice.toFixed(2)}`)
                }
                {!market.settled && lastHourData.length > 1 && <MiniSparkline data={lastHourData} />}
              </div>
              {!market.settled && priceAgeSec !== null && (
                <div className={cn('mt-1', priceAgeSec > 90 ? 'text-amber-400' : 'text-ice-faint')} style={{ ...FONT, fontSize: '11px' }}>
                  RedStone · {priceAgeSec < 60 ? `${priceAgeSec}s ago` : `${Math.floor(priceAgeSec / 60)}m ${priceAgeSec % 60}s ago`}
                </div>
              )}
            </div>
            <div className="p-3.5 md:p-4">
              <div className="text-ice-faint mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {market.settled ? 'Winning Bin' : 'Most Likely'}
                <InfoTip text={market.settled
                  ? 'The price bin that contained the settlement price. Positions covering this bin receive payouts.'
                  : 'The price bin with the highest probability based on current market trading activity. Updates as traders buy and sell.'
                } />
              </div>
              <div className={cn('font-semibold', market.settled ? 'text-ice-up' : 'text-ice-up')} style={{ ...FONT, fontSize: '20px' }}>
                {market.settled && market.settlementTick !== null ? (
                  formatTickAsPrice(market.settlementTick, market.tickDivisor)
                ) : binsLoading ? (
                  <span className="text-ice-faint">...</span>
                ) : mostLikelyPrice === null ? (
                  <span className="text-ice-faint">&mdash;</span>
                ) : (
                  market.priceDecimals === 0 ? `$${Math.round(mostLikelyPrice).toLocaleString()}` : `$${mostLikelyPrice.toFixed(2)}`
                )}
              </div>
              {!market.settled && syncedPrice !== null && syncedAgeSec !== null && (
                <div className={cn('mt-1', syncGap ? 'text-amber-400' : 'text-ice-faint')} style={{ ...FONT, fontSize: '11px' }}>
                  Market synced to {market.priceDecimals === 0 ? `$${Math.round(syncedPrice).toLocaleString()}` : `$${syncedPrice.toFixed(2)}`} · {syncedAgeSec < 60 ? `${syncedAgeSec}s ago` : `${Math.floor(syncedAgeSec / 60)}m ago`}
                </div>
              )}
            </div>
            <div className="p-3.5 md:p-4">
              <div className="text-ice-faint mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {market.settled ? 'Status' : expired ? 'Trading Closed' : 'Trading Closes In'}
                <InfoTip text={market.settled
                  ? 'This market has been settled. Winners can claim their payouts.'
                  : 'Trading stops before settlement. The oracle price at the settlement time decides the winning bin; winning positions can claim after that.'
                } />
              </div>
              <div className={cn('font-semibold', market.settled ? 'text-ice-up' : 'text-ice-text')} style={{ fontSize: '20px', fontFamily: market.settled ? 'Inter, sans-serif' : undefined }}>
                {market.settled ? 'Settled' : expired ? 'Settling…' : <span className="font-mono">{countdown}</span>}
              </div>
              {!market.settled && market.settlementTimestamp > 0 && (
                <div className="text-ice-faint mt-1" style={{ ...FONT, fontSize: '11px' }}>
                  Settles at {formatTime(market.settlementTimestamp)}
                  {market.settlementTimestamp > market.tradingEnd && ` · ${Math.round((market.settlementTimestamp - market.tradingEnd) / 60)} min after close`}
                </div>
              )}
              {!expired && !market.settled && (() => {
                const now = Date.now() / 1000;
                const total = market.tradingEnd - market.tradingStart;
                const pct = total <= 0 ? 100 : Math.max(0, Math.min(100, ((now - market.tradingStart) / total) * 100));
                const color = pct < 50 ? '#4ade80' : pct < 80 ? '#fbbf24' : '#ef4444';
                return (
                  <div className="h-1 rounded-full bg-ice-line/[0.08] mt-2">
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
                <span className="text-ice-text font-semibold" style={{ ...FONT, fontSize: '16px' }}>
                  Market Chart
                  <InfoTip text="Left: price history, with this market's trading window shaded. Right: the implied-odds ladder — what the market charges for each bin right now. Drag the blue handles or use the arrow keys to set your range." />
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
                          ? 'bg-ice-line/[0.1] text-ice-text'
                          : 'text-ice-faint hover:text-ice-muted hover:bg-ice-line/[0.06]',
                      )}
                      style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>
                {market.numBins} bins · ${Number(market.tickSpacing) / tickDivisor > 1 ? (Number(market.tickSpacing) / tickDivisor).toLocaleString() : (Number(market.tickSpacing) / tickDivisor).toFixed(2)} each
              </span>
            </div>

            {binsLoading ? (
              <div className="h-[420px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-ice-faint animate-spin" />
              </div>
            ) : (
              <>
                <PriceDistributionChart
                  bins={bins}
                  chartData={chartData}
                  currentPrice={currentPrice}
                  syncedPrice={syncGap && syncedPrice !== null ? syncedPrice : undefined}
                  selectedMin={Number(lowerTick ?? market.minTick) / tickDivisor}
                  selectedMax={Number(upperTick ?? market.maxTick) / tickDivisor}
                  minPrice={market.minPrice}
                  maxPrice={market.maxPrice}
                  tickSpacing={Number(market.tickSpacing) / tickDivisor}
                  numBins={market.numBins}
                  priceDecimals={market.priceDecimals}
                  timeframeMinutes={chartTimeframe}
                  windowStart={market.tradingStart * 1000}
                  windowEnd={market.tradingEnd * 1000}
                  capacity={exposure && market.perBinCap > 0n ? new Map(bins.map((b) => [b.price, Number(exposure.get(b.tick.toString()) ?? 0n) / Number(market.perBinCap)])) : undefined}
                  onRangeChange={(newMin, newMax) => {
                    setLowerTick(BigInt(Math.round(newMin * tickDivisor)));
                    setUpperTick(BigInt(Math.round(newMax * tickDivisor)));
                  }}
                />
                {bins.length > 0 && (
                  <div className="mt-2 text-center" style={{ ...FONT, fontSize: '13px' }}>
                    <span className="text-ice-faint">Market-implied odds for your range: </span>
                    <span className="text-ice-accent font-medium">{(winProbability * 100).toFixed(1)}%</span>
                  </div>
                )}

              </>
            )}
          </div>
        </div>

        {/* ===== RIGHT PANEL — Trade Form ===== */}
        <div className="border border-ice-line/15 bg-ice-surface rounded-2xl overflow-hidden flex flex-col">
          <div className="flex-1 flex flex-col">
            <div className="p-5 space-y-5 flex-1">
                {market.tradingHalted && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-amber-400" style={{ ...FONT, fontSize: '12px' }}>
                      Trading is paused after a sharp price move. It resumes automatically once the next price reading confirms the new level, or when an operator resumes it. Settlement is not affected.
                    </span>
                  </div>
                )}
                {/* Slippage settings button */}
                <div className="flex items-center justify-between">
                  <div className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>
                    Price ranges in ${Number(market.tickSpacing) / tickDivisor > 1 ? (Number(market.tickSpacing) / tickDivisor).toLocaleString() : (Number(market.tickSpacing) / tickDivisor).toFixed(2)} increments
                  </div>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      showSettings ? 'text-ice-text bg-ice-line/[0.08]' : 'text-ice-faint hover:text-ice-text hover:bg-ice-line/[0.06]',
                    )}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {/* Slippage settings */}
                {showSettings && (
                  <div className="p-3 bg-ice-surface2 border border-ice-line/[0.06] rounded-xl">
                    <div className="text-ice-faint mb-2" style={{ ...FONT, fontSize: '12px' }}>
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
                            slippage === opt.value ? 'bg-ice-line/[0.08] text-ice-text' : 'bg-ice-surface2 text-ice-muted hover:text-ice-text',
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
                          const ts = market.tickSpacing;
                          // bin containing the current price: [centerTick, centerTick + spacing)
                          const centerTick = (BigInt(Math.round(currentPrice * tickDivisor)) / ts) * ts;
                          const k = BigInt(preset.bins);
                          const lo = centerTick - k * ts < market.minTick ? market.minTick : centerTick - k * ts;
                          const hi = centerTick + (k + 1n) * ts > market.maxTick ? market.maxTick : centerTick + (k + 1n) * ts;
                          setLowerTick(lo);
                          setUpperTick(hi);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-ice-surface2 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                {typicalMove && !market.settled && (
                  <div className="text-ice-faint -mt-3" style={{ ...FONT, fontSize: '11px' }}>
                    Typical move until settlement ≈ ±${typicalMove.abs.toFixed(market.priceDecimals === 0 ? 0 : 3)} ({(typicalMove.pct * 100).toFixed(2)}%, ~{typicalMove.bins.toFixed(1)} bins)
                    <InfoTip text={`One standard deviation of ${market.assetSymbol}'s price over the time left to settlement, from its typical daily volatility (${(market.dailyVol * 100).toFixed(1)}%/day). A range much narrower than this is a long shot; much wider pays little.`} />
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
                <div className="text-ice-faint text-center" style={{ ...FONT, fontSize: '11px' }}>
                  {lowerTick !== null && upperTick !== null
                    ? <>Wins if {market.assetSymbol} settles in {formatTickAsPrice(lowerTick, tickDivisor)} – {formatTickAsPrice(upperTick, tickDivisor)} (at or above the low, below the high)</>
                    : 'Wins if the settlement price is at or above Min Price and below Max Price'}
                </div>

                {/* Win Probability / Avg Price */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-ice-surface2 border border-ice-line/[0.06] rounded-xl p-3">
                    <div className="text-ice-faint mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Implied Odds
                      <InfoTip text="What the market currently charges for your range, read as odds (1 USDC probe per bin). This is a price, not a forecast: it moves with every trade and can be far from the real probability when the book is one-sided." />
                    </div>
                    <div className="text-ice-text font-semibold" style={{ ...FONT, fontSize: '18px' }}>
                      {binsLoading ? '...' : `${(winProbability * 100).toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="flex-1 bg-ice-surface2 border border-ice-line/[0.06] rounded-xl p-3">
                    <div className="text-ice-faint mb-1" style={{ ...FONT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Price per $1
                      <InfoTip text="Average cost of one payout unit for this order. Each unit pays $1 if the settlement price is inside your range. Larger orders pay a higher average because every unit you buy raises the price of the next one." />
                    </div>
                    <div className="text-ice-text font-semibold" style={{ ...FONT, fontSize: '18px' }}>
                      {costLoading ? '...' : avgPrice > 0 ? `$${avgPrice.toFixed(avgPrice < 0.01 ? 4 : 2)}` : '-'}
                    </div>
                  </div>
                </div>
                {oddsAfter !== null && !costLoading && (
                  <div className="text-ice-faint -mt-3 px-1" style={{ ...FONT, fontSize: '11px' }}>
                    Price impact{isPreview ? ' of $10' : ''}: odds {(winProbability * 100).toFixed(1)}% → ≈{(oddsAfter * 100).toFixed(1)}% after your trade
                  </div>
                )}
                {syncGap && syncedPrice !== null ? (
                  <div className="text-amber-400 px-1" style={{ ...FONT, fontSize: '11px' }}>
                    Odds and cost use the market's synced price (${syncedPrice.toFixed(2)}), which is in a different bin than the live price (${currentPrice.toFixed(2)}). Your order carries the live price, so the market syncs first and the final cost is re-quoted.
                  </div>
                ) : null}

                {/* Spend input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      You Pay (USDC)
                      <InfoTip text="How much USDC you want to spend. If the settlement price lands in your range, you win a payout. If not, you lose this amount." />
                    </span>
                    {usdcBalance !== undefined && (
                      <button
                        onClick={() => {
                          const bal = Number(usdcBalance as bigint) / 1e6;
                          setSpendInput(bal.toFixed(2));
                        }}
                        className="text-ice-faint hover:text-ice-text transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        Max
                      </button>
                    )}
                  </div>
                  <div className="bg-ice-surface2 rounded-xl px-4 py-3">
                    <input
                      type="text"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-ice-text text-right focus:outline-none font-medium text-xl"
                      style={FONT}
                    />
                  </div>
                  {usdcBalance !== undefined && (
                    <div className="text-ice-faint mt-1" style={{ ...FONT, fontSize: '11px' }}>
                      Balance: {formatUsdc(usdcBalance as bigint)}
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-1.5">
                    {AMOUNT_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setSpendInput(amt.toString())}
                        className="px-2.5 py-1 rounded-lg bg-ice-surface2 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors"
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
                        className="px-2.5 py-1 rounded-lg bg-ice-surface2 text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors"
                        style={{ ...FONT, fontSize: '11px' }}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>

                {/* Order limited: by the per-bin exposure cap, or by market liquidity */}
                {maxSpend !== null && !costLoading && !isPreview && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-amber-400" style={{ ...FONT, fontSize: '12px' }}>
                      {limitedBy === 'cap'
                        ? <>This range can take <strong>${maxSpend.toFixed(2)}</strong> more right now ({Math.floor(headroomUnits ?? 0).toLocaleString()} payout units; each bin is limited to {(Number(market.perBinCap) / 1e6).toLocaleString()}). Your order is sized to that.</>
                        : <>Max spend for this range is <strong>${maxSpend.toFixed(2)}</strong> (market liquidity limit).</>}
                    </span>
                  </div>
                )}
                {headroomUnits !== null && market.perBinCap > 0n && headroomUnits <= 0 && (
                  <div className="flex items-center gap-2 p-3 bg-ice-down/10 border border-ice-down/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-ice-down shrink-0" />
                    <span className="text-ice-down" style={{ ...FONT, fontSize: '12px' }}>A bin in this range is full (limit {(Number(market.perBinCap) / 1e6).toLocaleString()} payout units). Pick a range that avoids it.</span>
                  </div>
                )}

                {/* Inline receipt after a successful order (no modal: the chart and the new position stay visible) */}
                {step === 'success' && lastOrder && (
                  <div className="bg-ice-up/[0.06] border border-ice-up/25 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 text-ice-up font-medium" style={{ ...FONT, fontSize: '13px' }}>
                      <Check className="w-4 h-4" /> Position opened
                      {txHash && (
                        <a href={`https://testnet.snowtrace.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-ice-faint hover:text-ice-text font-normal transition-colors" style={{ fontSize: '11px' }}>
                          Tx <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {([
                      ['Range', `${formatTickAsPrice(lastOrder.lo, tickDivisor)} – ${formatTickAsPrice(lastOrder.hi, tickDivisor)}`],
                      ['Payout units', lastOrder.units.toFixed(2)],
                      ['Paid', `$${lastOrder.paid.toFixed(2)}`],
                      ['Price per $1', `$${lastOrder.perUnit.toFixed(lastOrder.perUnit < 0.01 ? 4 : 2)}`],
                      ['Payout if win', `$${lastOrder.units.toFixed(2)}${lastOrder.paid > 0 ? ` (×${(lastOrder.units / lastOrder.paid).toFixed(1)})` : ''}`],
                      ['Odds at entry', `${(lastOrder.odds * 100).toFixed(1)}%`],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between" style={{ ...FONT, fontSize: '12px' }}>
                        <span className="text-ice-faint">{k}</span><span className="text-ice-text">{v}</span>
                      </div>
                    ))}
                    <div className="text-ice-faint pt-1" style={{ ...FONT, fontSize: '11px' }}>It appears under Your Positions below; you can sell it back until trading closes.</div>
                  </div>
                )}

                {/* Payout summary (shows a $10 preview until an amount is entered) */}
                {step !== 'success' && resolvedQty > 0 && !!cost && (
                  <div className="bg-ice-surface2 border border-ice-line/[0.06] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>
                        {isPreview ? 'Payout if Win (for $10)' : 'Payout if Win'}
                        <InfoTip text="Total USDC you receive if the settlement price lands inside your range. The multiplier shows your return vs. cost." />
                      </span>
                      <span className="text-ice-up font-medium" style={{ ...FONT, fontSize: '13px' }}>
                        {costLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : (
                          <>
                            ${receiveIfWin.toFixed(2)}
                            {payoutMultiplier > 0 && (
                              <span className="text-ice-faint ml-1.5 font-normal">×{payoutMultiplier.toFixed(1)}</span>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>
                        {isPreview ? 'Est. Cost (preview)' : 'Est. Cost'}
                        <InfoTip text="Actual cost calculated by the smart contract. May differ slightly from your input due to CLMSR pricing dynamics." />
                      </span>
                      <span className="text-ice-text" style={{ ...FONT, fontSize: '13px' }}>
                        {costLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : formatUsdc(cost)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {(costError || execError) && (
                <div className="px-5 pb-3">
                  <div className="flex items-center gap-2 p-3 bg-ice-down/10 border border-ice-down/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-ice-down shrink-0" />
                    <span className="text-ice-down" style={{ ...FONT, fontSize: '13px' }}>
                      {costError || execError}
                    </span>
                  </div>
                </div>
              )}

              {/* Action button */}
              <div className="p-5 pt-0">
                <button
                  onClick={step === 'success' ? () => { reset(); setSpendInput(''); } : handleOpenClick}
                  disabled={step === 'success' ? false : isButtonDisabled()}
                  className={cn(
                    'w-full py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2.5',
                    step === 'success'
                      ? 'bg-ice-surface2 text-ice-text hover:bg-ice-line/[0.1]'
                      : hasInsufficientBalance
                      ? 'bg-ice-down/10 text-ice-down cursor-not-allowed'
                      : isButtonDisabled()
                        ? 'bg-ice-surface2 text-ice-faint cursor-not-allowed'
                        : 'bg-[linear-gradient(180deg,#8be4ff,#4db8ff)] text-[#06223a] hover:brightness-110',
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
                    className="inline-flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors"
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
              <span className="text-ice-text font-medium" style={{ ...FONT, fontSize: '14px' }}>
                Your Positions
              </span>
              <span className="text-ice-faint" style={{ ...FONT, fontSize: '12px' }}>
                ({marketPositions.length})
              </span>
              <ClaimAllButton positions={marketPositions} />
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
