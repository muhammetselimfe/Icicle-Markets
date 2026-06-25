import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Coins, ChevronDown } from 'lucide-react';
import { ErrorState } from '@/app/components/ui/data-states';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { MarketState, type MarketDisplay } from '@/app/types/options';
import { formatUsdc, formatTickAsPrice } from '@/app/utils/options';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useChainId } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { ERC20_ABI } from '@/app/config/options-abis';
import { OptionMarketCard } from '@/app/components/option-market-card';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

function StateBadge({ state, label }: { state: MarketState; label: string }) {
  const colors: Record<number, string> = {
    [MarketState.Trading]: 'bg-ice-up/[0.08] text-ice-up border border-ice-up/20',
    [MarketState.SettlementOpen]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.PendingOps]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.FinalizedPrimary]: 'bg-ice-line/[0.06] text-ice-faint',
    [MarketState.FinalizedSecondary]: 'bg-ice-line/[0.06] text-ice-faint',
    [MarketState.FailedPendingManual]: 'bg-ice-down/10 text-ice-down',
  };
  return (
    <span
      className={cn('px-2.5 py-1 rounded-md font-mono inline-flex items-center gap-1.5', colors[state] ?? 'bg-ice-line/[0.06] text-ice-faint')}
      style={{ fontSize: '11px' }}
    >
      {state === MarketState.Trading && <span className="w-1.5 h-1.5 rounded-full bg-ice-up" />}
      {label}
    </span>
  );
}

function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-2xl bg-ice-surface border border-ice-line/15 p-4 lg:p-[18px] flex flex-col gap-2.5">
      <span className="font-mono text-ice-faint uppercase" style={{ fontSize: '10px', letterSpacing: '1px' }}>{label}</span>
      <span className={cn('font-mono font-semibold leading-none', accent ? 'text-ice-accent' : 'text-ice-text')} style={{ fontSize: '22px' }}>
        {value}
      </span>
    </div>
  );
}

export function OptionsView() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();

  const { markets, loading: marketsLoading, error: marketsError, refetch: refetchMarkets } = useOptionsMarkets();

  const liveCount = markets.filter((m) => m.state === MarketState.Trading).length;
  const settledCount = markets.length - liveCount;
  const assetCount = new Set(markets.map((m) => m.assetSymbol)).size;

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 shrink-0 rounded-[9px] bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
          <Target className="w-[18px] h-[18px] text-ice-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-ice-text font-bold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px' }}>
            Icicle Options
          </div>
          <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            Prediction markets on Avalanche. Pick a price range, trade, and win if you're right.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-ice-surface border border-ice-line/15">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
          <span className="font-mono text-yellow-400" style={{ fontSize: '12px' }}>Fuji Testnet</span>
        </div>
      </div>

      {/* Stats strip */}
      {!marketsError && (
        <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-6">
          <StatCard label="Live Markets" value={marketsLoading ? '—' : String(liveCount)} accent />
          <StatCard label="Settled" value={marketsLoading ? '—' : String(settledCount)} />
          <StatCard label="Total Markets" value={marketsLoading ? '—' : String(markets.length)} />
          <StatCard label="Assets" value={marketsLoading ? '—' : String(assetCount)} />
        </div>
      )}

      {/* Testnet info banner with faucet */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-ice-surface border border-ice-line/15 rounded-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
          <span className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            Options markets are in testnet. You may need to switch networks when trading.
          </span>
        </div>
        {isConnected && <ClaimTestUsdcButton />}
      </div>

      {/* Markets */}
      {marketsError ? (
        <ErrorState message={marketsError} onRetry={refetchMarkets} />
      ) : marketsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-ice-surface border border-ice-line/15 p-[18px] rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1"><Skeleton className="h-4 w-24 mb-1.5" /><Skeleton className="h-3 w-16" /></div>
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-[68px] w-full" />
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
      <span className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
        Balance: <span className="text-ice-text font-mono font-medium">{balanceStr}</span>
      </span>
      <button
        onClick={handleClaim}
        disabled={isBusy}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap border',
          isSuccess
            ? 'bg-ice-up/10 text-ice-up border-ice-up/20'
            : isBusy
            ? 'bg-ice-line/[0.06] text-ice-faint border-transparent cursor-not-allowed'
            : 'bg-ice-accent/10 text-ice-accent border-ice-line/30 hover:bg-ice-accent/20',
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

function MarketsListing({ markets, onTrade }: { markets: MarketDisplay[]; onTrade: (id: number) => void }) {
  const liveMarkets = [...markets]
    .filter((m) => m.state === MarketState.Trading)
    .sort((a, b) => b.marketId - a.marketId);
  const settledMarkets = [...markets]
    .filter((m) => m.state !== MarketState.Trading)
    .sort((a, b) => b.marketId - a.marketId);

  // Default the settled list open when there's nothing live to show, so the
  // page is immediately useful instead of an empty void.
  const [settledOpen, setSettledOpen] = useState(liveMarkets.length === 0);

  return (
    <div className="space-y-6">
      {/* Live Markets */}
      {liveMarkets.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-ice-up" />
            <h3 className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Live ({liveMarkets.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveMarkets.map((m) => (
              <OptionMarketCard key={m.marketId} market={m} onClick={() => onTrade(m.marketId)} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="No live markets right now — check back soon or browse settled markets below." />
      )}

      {/* Settled Markets — compact rows, collapsible */}
      {settledMarkets.length > 0 && (
        <div>
          <button onClick={() => setSettledOpen((o) => !o)} className="flex items-center gap-2 mb-3 group">
            <div className="w-2 h-2 rounded-full bg-ice-faint" />
            <h3 className="text-ice-muted font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Settled ({settledMarkets.length})
            </h3>
            <ChevronDown className={cn('w-4 h-4 text-ice-faint transition-transform', settledOpen && 'rotate-180')} />
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
      className="flex items-center gap-4 px-4 py-3 bg-ice-surface border border-ice-line/15 rounded-xl cursor-pointer hover:border-ice-line/30 hover:bg-ice-surface2 transition-all"
    >
      <AssetLogo src={m.assetLogo} symbol={m.assetSymbol} />
      <div className="flex-1 min-w-0">
        <span className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
          {m.assetSymbol}/USD
        </span>
        <span className="text-ice-faint font-mono ml-2" style={{ fontSize: '12px' }}>#{m.marketId}</span>
      </div>
      <span className="text-ice-muted font-mono hidden sm:block" style={{ fontSize: '13px' }}>
        {formatTickAsPrice(m.minTick, m.tickDivisor)} – {formatTickAsPrice(m.maxTick, m.tickDivisor)}
      </span>
      <span className="text-ice-faint font-mono" style={{ fontSize: '12px' }}>{formatTimestamp(m.tradingEnd)}</span>
      <StateBadge state={m.state} label={m.stateLabel} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center text-center p-12 rounded-2xl bg-ice-surface border border-ice-line/15 text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
      {message}
    </div>
  );
}
