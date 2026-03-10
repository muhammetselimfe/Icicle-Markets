import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, TrendingUp, Clock, Grid3X3, Coins, ChevronDown } from 'lucide-react';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { MarketState, type MarketDisplay } from '@/app/types/options';
import { formatUsdc, formatTickAsPrice } from '@/app/utils/options';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useChainId } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { ERC20_ABI } from '@/app/config/options-abis';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

function StateBadge({ state, label }: { state: MarketState; label: string }) {
  const colors: Record<number, string> = {
    [MarketState.Trading]: 'bg-green-500/10 text-green-400',
    [MarketState.SettlementOpen]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.PendingOps]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.FinalizedPrimary]: 'bg-slate-500/10 text-slate-400',
    [MarketState.FinalizedSecondary]: 'bg-slate-500/10 text-slate-400',
    [MarketState.FailedPendingManual]: 'bg-red-500/10 text-red-400',
  };
  const isLive = state === MarketState.Trading;
  return (
    <span
      className={cn('px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1.5', colors[state] ?? 'bg-white/5 text-slate-400')}
      style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}
    >
      {isLive && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
      )}
      {label}
    </span>
  );
}

function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function useCountdown(targetUnix: number) {
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
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function OptionsView() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();

  const { markets, loading: marketsLoading, error: marketsError } = useOptionsMarkets();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Testnet info banner with faucet */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
          <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            Options markets are in testnet. You may need to switch networks when trading.
          </span>
        </div>
        {isConnected && <ClaimTestUsdcButton />}
      </div>

      {/* Markets */}
      {marketsError ? (
        <div className="flex items-center justify-center gap-2 p-12 text-red-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
          <AlertCircle className="w-5 h-5" />
          {marketsError}
        </div>
      ) : marketsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : markets.length === 0 ? (
        <EmptyState message="No prediction markets available yet" />
      ) : (
        <MarketsListing markets={markets} onTrade={(id) => navigate(`/options/trade/${id}`)} />
      )}
    </div>
  );
}

const FAUCET_AMOUNT = 1000n * 1_000_000n; // 1000 USDC (6 decimals)

export function ClaimTestUsdcButton() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });
  const { data: walletClient } = useWalletClient({ chainId: CHAIN_IDS.FUJI });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_IDS.FUJI,
    query: { enabled: !!address },
  });

  const [mintState, setMintState] = useState<'idle' | 'pending' | 'confirming' | 'success'>('idle');

  const handleClaim = async () => {
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (!address || !publicClient || !walletClient) return;
    try {
      setMintState('pending');
      const gas = await publicClient.estimateContractGas({
        address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [address, FAUCET_AMOUNT],
        account: address,
      });
      const hash = await walletClient.writeContract({
        address: OPTIONS_CONTRACTS.usdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [address, FAUCET_AMOUNT],
        gas: gas + gas / 4n,
      });
      setMintState('confirming');
      await publicClient.waitForTransactionReceipt({ hash });
      setMintState('success');
      refetchBalance();
      setTimeout(() => setMintState('idle'), 3000);
    } catch {
      setMintState('idle');
    }
  };

  const balanceStr = balance !== undefined ? formatUsdc(balance as bigint) : '...';
  const isSuccess = mintState === 'success';
  const isBusy = mintState !== 'idle' && mintState !== 'success' || isSwitching;

  return (
    <div className="flex items-center gap-3 w-full sm:w-auto">
      <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
        Balance: <span className="text-white font-medium">{balanceStr}</span>
      </span>
      <button
        onClick={handleClaim}
        disabled={isBusy}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap',
          isSuccess
            ? 'bg-green-500/10 text-green-400'
            : isBusy
            ? 'bg-white/5 text-slate-500 cursor-not-allowed'
            : 'bg-[#8be4ff]/10 text-[#8be4ff] hover:bg-[#8be4ff]/20',
        )}
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
      >
        {isBusy && !isSuccess && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {isSuccess ? 'Claimed!' : isWrongChain ? 'Switch to Fuji' : (
          <>
            <Coins className="w-3.5 h-3.5" />
            Claim 1,000 Test USDC
          </>
        )}
      </button>
    </div>
  );
}

function AssetLogo({ src, symbol }: { src: string; symbol: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">{symbol.slice(0, 2)}</div>;
  }
  return <img src={src} alt={symbol} className="w-8 h-8 rounded-full" onError={() => setFailed(true)} />;
}

function MarketCard({ market: m, onTrade }: { market: import('@/app/types/options').MarketDisplay; onTrade: () => void }) {
  const isActive = m.state === MarketState.Trading;
  const countdown = useCountdown(m.tradingEnd);

  return (
    <div
      onClick={onTrade}
      className={cn(
        'bg-white/[0.02] border rounded-2xl transition-all cursor-pointer overflow-hidden',
        isActive
          ? 'border-green-500/20 hover:border-green-500/30 hover:bg-white/[0.04]'
          : 'border-white/5 hover:border-white/10 hover:bg-white/[0.04]',
      )}
    >
      {/* Accent bar for active markets */}
      {isActive && (
        <div className="h-1 bg-gradient-to-r to-transparent" style={{ backgroundImage: `linear-gradient(to right, ${m.accentColor}, transparent)` }} />
      )}

      <div className="p-5 space-y-4">
        {/* Header: logo + title + badge */}
        <div className="flex items-center gap-3">
          <AssetLogo src={m.assetLogo} symbol={m.assetSymbol} />
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
              {m.assetSymbol}/USD
            </div>
            <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              Market #{m.marketId}
            </div>
          </div>
          <StateBadge state={m.state} label={m.stateLabel} />
        </div>

        {/* Info rows */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-white" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
              {formatTickAsPrice(m.minTick, m.tickDivisor)} – {formatTickAsPrice(m.maxTick, m.tickDivisor)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {formatTimestamp(m.tradingStart)} – {formatTimestamp(m.tradingEnd)}
            </span>
          </div>
          {isActive && countdown && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-green-400 font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                Closes in {countdown}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {m.numBins} bins
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketsListing({ markets, onTrade }: { markets: MarketDisplay[]; onTrade: (id: number) => void }) {
  const [settledOpen, setSettledOpen] = useState(false);

  const liveMarkets = [...markets]
    .filter((m) => m.state === MarketState.Trading)
    .sort((a, b) => b.marketId - a.marketId);
  const settledMarkets = [...markets]
    .filter((m) => m.state !== MarketState.Trading)
    .sort((a, b) => b.marketId - a.marketId);

  return (
    <div className="space-y-6">
      {/* Live Markets */}
      {liveMarkets.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <h3 className="text-slate-300 font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Live ({liveMarkets.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveMarkets.map((m) => (
              <MarketCard key={m.marketId} market={m} onTrade={() => onTrade(m.marketId)} />
            ))}
          </div>
        </div>
      )}

      {/* Settled Markets — compact rows, collapsible */}
      {settledMarkets.length > 0 && (
        <div>
          <button
            onClick={() => setSettledOpen((o) => !o)}
            className="flex items-center gap-2 mb-3 group"
          >
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <h3 className="text-slate-500 font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Settled ({settledMarkets.length})
            </h3>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-slate-500 transition-transform',
                settledOpen && 'rotate-180',
              )}
            />
          </button>
          {settledOpen && (
            <div className="space-y-2">
              {settledMarkets.map((m) => (
                <SettledMarketRow key={m.marketId} market={m} onTrade={() => onTrade(m.marketId)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettledMarketRow({ market: m, onTrade }: { market: MarketDisplay; onTrade: () => void }) {
  return (
    <div
      onClick={onTrade}
      className="flex items-center gap-4 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:border-white/10 hover:bg-white/[0.04] transition-all"
    >
      <AssetLogo src={m.assetLogo} symbol={m.assetSymbol} />
      <div className="flex-1 min-w-0">
        <span className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
          {m.assetSymbol}/USD
        </span>
        <span className="text-slate-500 ml-2" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
          #{m.marketId}
        </span>
      </div>
      <span className="text-slate-400 hidden sm:block" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
        {formatTickAsPrice(m.minTick, m.tickDivisor)} – {formatTickAsPrice(m.maxTick, m.tickDivisor)}
      </span>
      <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
        {formatTimestamp(m.tradingEnd)}
      </span>
      <StateBadge state={m.state} label={m.stateLabel} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center p-12 text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
      {message}
    </div>
  );
}

