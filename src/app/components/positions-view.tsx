import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { useOptionsPositions } from '@/app/hooks/useOptionsPositions';
import { MarketState, type PositionDisplay, type MarketDisplay } from '@/app/types/options';
import { formatUsdc, formatTickAsPrice } from '@/app/utils/options';
import { useOptionsTrading } from '@/app/hooks/useOptionsTrading';
import { useChainSwitch } from '@/app/hooks/useChainSwitch';
import { useChainId } from 'wagmi';
import { CHAIN_IDS } from '@/app/config/wagmi';
import { ClaimTestUsdcButton } from '@/app/components/options-view';

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

function AssetLogo({ src, symbol }: { src: string; symbol: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">{symbol.slice(0, 2)}</div>;
  }
  return <img src={src} alt={symbol} className="w-8 h-8 rounded-full" onError={() => setFailed(true)} />;
}

function PortfolioSummary({ positions }: { positions: PositionDisplay[] }) {
  // Split positions
  const activePositions = positions.filter((p) => p.marketState === MarketState.Trading);
  const finalizedPositions = positions.filter(
    (p) => p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary,
  );

  // Total value across all positions
  const totalValue = positions.reduce((s, p) => {
    const isFinalized = p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary;
    const isFinLoss = isFinalized && p.isWinner === false;
    if (isFinLoss) return s;
    const isFinWin = isFinalized && p.isWinner === true;
    return s + (isFinWin ? p.quantity : p.currentValue);
  }, 0n);

  // Unrealized P&L (active/trading only)
  const unrealizedPnl = activePositions.reduce((s, p) => s + (p.currentValue - p.costBasis), 0n);
  const unrealizedCost = activePositions.reduce((s, p) => s + p.costBasis, 0n);
  const unrealizedDollars = Number(unrealizedPnl) / 1e6;
  const unrealizedCostDollars = Number(unrealizedCost) / 1e6;
  const unrealizedPercent = unrealizedCostDollars > 0 ? (unrealizedDollars / unrealizedCostDollars) * 100 : 0;
  const unrealizedUp = unrealizedPnl >= 0n;

  // Realized P&L (finalized only)
  const realizedPnl = finalizedPositions.reduce((s, p) => {
    const isLoss = p.isWinner === false;
    return s + (isLoss ? -p.costBasis : p.quantity - p.costBasis);
  }, 0n);
  const realizedCost = finalizedPositions.reduce((s, p) => s + p.costBasis, 0n);
  const realizedDollars = Number(realizedPnl) / 1e6;
  const realizedCostDollars = Number(realizedCost) / 1e6;
  const realizedPercent = realizedCostDollars > 0 ? (realizedDollars / realizedCostDollars) * 100 : 0;
  const realizedUp = realizedPnl >= 0n;

  const settledCount = positions.filter((p) => p.marketState !== MarketState.Trading).length;

  return (
    <div className="mb-6 space-y-4">
      {/* Row 1: ClaimTestUsdcButton (includes balance display) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
        <ClaimTestUsdcButton />
      </div>

      {/* Row 2: Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Value" value={formatUsdc(totalValue)} accent="ice" />
        <StatCard
          label="Unrealized P&L"
          value={`${unrealizedUp ? '+' : ''}$${unrealizedDollars.toFixed(2)} (${unrealizedUp ? '+' : ''}${unrealizedPercent.toFixed(1)}%)`}
          valueColor={unrealizedUp ? 'text-green-400' : 'text-red-400'}
          accent={unrealizedUp ? 'green' : 'red'}
        />
        <StatCard
          label="Realized P&L"
          value={`${realizedUp ? '+' : ''}$${realizedDollars.toFixed(2)} (${realizedUp ? '+' : ''}${realizedPercent.toFixed(1)}%)`}
          valueColor={realizedUp ? 'text-green-400' : 'text-red-400'}
          accent={realizedUp ? 'green' : 'red'}
        />
        <StatCard label="Positions">
          <div className="mt-1 space-y-0.5">
            <div className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              {activePositions.length} Active
            </div>
            <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {settledCount} Settled
            </div>
          </div>
        </StatCard>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueColor,
  accent,
  children,
}: {
  label: string;
  value?: string;
  valueColor?: string;
  accent?: 'ice' | 'green' | 'red';
  children?: React.ReactNode;
}) {
  const accentClasses: Record<string, string> = {
    ice: 'border-l-2 border-l-[#8be4ff]/30 bg-[#8be4ff]/[0.02]',
    green: 'border-l-2 border-l-green-500/40 bg-green-500/[0.02]',
    red: 'border-l-2 border-l-red-500/40 bg-red-500/[0.02]',
  };
  return (
    <div className={cn('bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3', accent && accentClasses[accent])}>
      <div className="text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
        {label}
      </div>
      {children ?? (
        <div
          className={cn('font-medium mt-1', valueColor ?? 'text-white')}
          style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export function PositionsView() {
  const { login } = useLogin();
  const { authenticated, logout } = usePrivy();
  const { isConnected } = useAccount();

  const handleLogin = async () => {
    if (authenticated) {
      await logout();
    }
    login();
  };

  const { markets } = useOptionsMarkets();
  const { positions, loading: positionsLoading } = useOptionsPositions();

  const marketMap = new Map(markets.map((m) => [m.marketId, m]));

  // Split into active vs settled
  const activePositions = positions.filter((p) => p.marketState === MarketState.Trading);
  const settledPositions = positions.filter((p) => p.marketState !== MarketState.Trading);

  // Sort each group by marketId desc, positionId desc
  const sortByRecent = (a: PositionDisplay, b: PositionDisplay) =>
    b.marketId - a.marketId || b.positionId - a.positionId;
  activePositions.sort(sortByRecent);
  settledPositions.sort(sortByRecent);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
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
        <div className="space-y-4">
          {/* Skeleton for summary */}
          <div className="flex gap-3">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Portfolio summary (always shown when connected) */}
          <PortfolioSummary positions={positions} />

          {positions.length === 0 ? (
            <div className="flex items-center justify-center p-12 text-slate-500" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              No open positions
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Positions */}
              {activePositions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <h3 className="text-slate-300 font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                      Active ({activePositions.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activePositions.map((p) => (
                      <PositionCard key={p.positionId} position={p} market={marketMap.get(p.marketId)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Settled Positions */}
              {settledPositions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-slate-500" />
                    <h3 className="text-slate-500 font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                      Settled ({settledPositions.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {settledPositions.map((p) => (
                      <PositionCard key={p.positionId} position={p} market={marketMap.get(p.marketId)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PositionCard({ position: p, market }: { position: PositionDisplay; market?: MarketDisplay }) {
  const navigate = useNavigate();
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
      onClick={() => navigate(`/options/trade/${p.marketId}`)}
      className={cn(
        'bg-white/[0.02] border rounded-2xl overflow-hidden cursor-pointer transition-all',
        isActive
          ? 'border-green-500/20 hover:border-green-500/30 hover:bg-white/[0.04]'
          : 'border-white/5 hover:border-white/10 hover:bg-white/[0.04]',
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
        <div className="px-5 pb-5" onClick={(e) => e.stopPropagation()}>
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
