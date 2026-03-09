import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Wallet, TrendingUp, Clock, Grid3X3, Coins } from 'lucide-react';
import { useAccount, useReadContract, usePublicClient, useWalletClient } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { useOptionsPositions } from '@/app/hooks/useOptionsPositions';
import { MarketState, type PositionDisplay, type MarketDisplay } from '@/app/types/options';
import { formatUsdc, formatTickAsPrice } from '@/app/utils/options';
import { useOptionsTrading } from '@/app/hooks/useOptionsTrading';
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
  return (
    <span
      className={cn('px-2.5 py-1 rounded-lg font-medium', colors[state] ?? 'bg-white/5 text-slate-400')}
      style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}
    >
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
  const { login } = useLogin();
  const { authenticated, logout } = usePrivy();
  const navigate = useNavigate();
  const { isConnected } = useAccount();

  const handleLogin = async () => {
    if (authenticated) {
      await logout();
    }
    login();
  };
  const { markets, loading: marketsLoading, error: marketsError } = useOptionsMarkets();
  const { positions, loading: positionsLoading } = useOptionsPositions();

  const marketMap = new Map(markets.map((m) => [m.marketId, m]));

  const sortedPositions = [...positions].sort((a, b) => {
    const aActive = a.marketState === MarketState.Trading ? 0 : 1;
    const bActive = b.marketState === MarketState.Trading ? 0 : 1;
    return aActive - bActive || b.marketId - a.marketId || b.positionId - a.positionId;
  });

  const [subTab, setSubTab] = useState<'markets' | 'positions'>('markets');

  const subTabs = [
    { id: 'markets' as const, label: 'Active Markets' },
    { id: 'positions' as const, label: 'My Positions' },
  ];

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

      {/* Sub-tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg transition-all font-medium whitespace-nowrap',
                subTab === tab.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
              )}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Markets sub-tab — card grid */}
      {subTab === 'markets' && (
        <>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...markets]
                .sort((a, b) => {
                  const aActive = a.state === MarketState.Trading ? 0 : 1;
                  const bActive = b.state === MarketState.Trading ? 0 : 1;
                  return aActive - bActive || b.marketId - a.marketId;
                })
                .map((m) => (
                <MarketCard key={m.marketId} market={m} onTrade={() => navigate(`/options/trade/${m.marketId}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Positions sub-tab — card grid */}
      {subTab === 'positions' && (
        <>
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Wallet className="w-10 h-10 text-slate-500" />
              <span className="text-slate-400" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                Sign in to view your positions
              </span>
              <button
                onClick={() => handleLogin()}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-lg font-medium transition-colors"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
              >
                Sign In
              </button>
            </div>
          ) : positionsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl space-y-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : positions.length === 0 ? (
            <EmptyState message="No open positions" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedPositions.map((p) => (
                <PositionCard key={p.positionId} position={p} market={marketMap.get(p.marketId)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const FAUCET_AMOUNT = 1000n * 1_000_000n; // 1000 USDC (6 decimals)

function ClaimTestUsdcButton() {
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center p-12 text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
      {message}
    </div>
  );
}

function PositionCard({ position: p, market }: { position: PositionDisplay; market?: MarketDisplay }) {
  const chainId = useChainId();
  const { switchForTab, isSwitching } = useChainSwitch();
  const { step, txHash, error: execError, closePosition, claimPayout, reset } = useOptionsTrading();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const isFinalized = p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary;
  const isActive = p.marketState === MarketState.Trading;
  const canClose = isActive && !p.claimed;
  const canClaim = isFinalized && !p.claimed && p.isWinner === true;
  const isLoser = isFinalized && p.isWinner === false;

  // P&L calculation
  const valueAmount = isLoser ? 0n : canClaim ? p.quantity : p.currentValue;
  const pnl = isLoser ? -p.costBasis : valueAmount - p.costBasis;
  const pnlDollars = Number(pnl) / 1e6;
  const costBasisDollars = Number(p.costBasis) / 1e6;
  const pnlPercent = costBasisDollars > 0 ? (pnlDollars / costBasisDollars) * 100 : 0;
  const isProfitable = pnl >= 0n;

  const handleAction = async () => {
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (step === 'error') {
      reset();
      return;
    }
    if (canClaim) {
      await claimPayout(p.positionId);
    } else if (canClose) {
      await closePosition(p.positionId, 0n);
    }
  };

  const getActionText = () => {
    if (isWrongChain) return 'Switch Network';
    if (step === 'closing') return 'Closing...';
    if (step === 'claiming') return 'Claiming...';
    if (step === 'success') return 'Done!';
    if (step === 'error') return 'Retry';
    if (canClaim) return 'Claim Payout';
    if (canClose) return 'Close';
    if (p.claimed) return 'Claimed';
    return '-';
  };

  const isActionDisabled = step === 'closing' || step === 'claiming' || step === 'success';

  const stateLabel = market?.stateLabel ?? (isFinalized ? 'Finalized' : isActive ? 'Trading' : 'Unknown');

  return (
    <div
      className={cn(
        'bg-white/[0.02] border rounded-2xl overflow-hidden',
        isActive
          ? 'border-green-500/20'
          : 'border-white/5',
      )}
    >
      {/* Accent bar for active positions */}
      {isActive && market?.accentColor && (
        <div className="h-1 bg-gradient-to-r to-transparent" style={{ backgroundImage: `linear-gradient(to right, ${market.accentColor}, transparent)` }} />
      )}

      <div className="p-5">
        {/* Header: asset logo + symbol + state badge */}
        <div className="flex items-center gap-3">
          {market ? (
            <AssetLogo src={market.assetLogo} symbol={market.assetSymbol} />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">?</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
              {market ? `${market.assetSymbol}/USD` : `Market #${p.marketId}`}
            </div>
            <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              Position #{p.positionId}
            </div>
          </div>
          <StateBadge state={p.marketState} label={stateLabel} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Range</span>
            <span className="text-white" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
              {formatTickAsPrice(p.lowerTick, p.tickDivisor)} – {formatTickAsPrice(p.upperTick, p.tickDivisor)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Shares</span>
            <span className="text-slate-300" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
              {(Number(p.quantity) / 1e6).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Cost Basis</span>
            <span className="text-slate-300" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
              {formatUsdc(p.costBasis)}
            </span>
          </div>
          {/* P&L row */}
          <div className="flex items-center justify-between">
            <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>P&L</span>
            <span
              className={cn('font-medium', isProfitable ? 'text-green-400' : 'text-red-400')}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
            >
              {isProfitable ? '+' : ''}{`$${pnlDollars.toFixed(2)}`} ({isProfitable ? '+' : ''}{pnlPercent.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {isLoser ? 'Payout' : 'Value'}
            </span>
            <span className={cn('font-medium', isLoser ? 'text-red-400' : 'text-white')} style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
              {isLoser ? '$0.00' : formatUsdc(canClaim ? p.quantity : p.currentValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Action area */}
      {(canClose || canClaim) && (
        <div className="px-5 pb-5">
          {execError && (
            <div className="flex items-center gap-2 p-2 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <span className="text-red-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                {execError}
              </span>
            </div>
          )}
          <button
            onClick={handleAction}
            disabled={isActionDisabled}
            className={cn(
              'w-full px-4 py-3 rounded-xl font-medium transition-colors min-h-[44px] flex items-center justify-center gap-2',
              isActionDisabled
                ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                : canClaim
                ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
            )}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
          >
            {(step === 'closing' || step === 'claiming' || isSwitching) && (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            {getActionText()}
          </button>
          {txHash && step === 'success' && (
            <a
              href={`https://testnet.snowtrace.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center mt-2 text-slate-500 hover:text-white transition-colors"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}
            >
              View on Snowtrace
            </a>
          )}
        </div>
      )}

      {/* Lost badge */}
      {isLoser && (
        <div className="px-5 pb-5">
          <div
            className="w-full px-4 py-3 bg-red-500/10 text-red-400 rounded-xl font-medium text-center"
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
          >
            Lost
          </div>
        </div>
      )}

      {/* Claimed badge */}
      {p.claimed && (
        <div className="px-5 pb-5">
          <div
            className="w-full px-4 py-3 bg-white/5 text-slate-500 rounded-xl font-medium text-center"
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
          >
            Claimed
          </div>
        </div>
      )}
    </div>
  );
}
