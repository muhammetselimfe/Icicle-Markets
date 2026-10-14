import { useState, useCallback } from 'react';
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
    [MarketState.Trading]: 'bg-ice-up/[0.08] text-ice-up border border-ice-up/20',
    [MarketState.SettlementOpen]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.PendingOps]: 'bg-yellow-500/10 text-yellow-400',
    [MarketState.FinalizedPrimary]: 'bg-ice-line/[0.06] text-ice-faint',
    [MarketState.FinalizedSecondary]: 'bg-ice-line/[0.06] text-ice-faint',
    [MarketState.FailedPendingManual]: 'bg-ice-down/10 text-ice-down',
  };
  return (
    <span className={cn('px-2.5 py-1 rounded-md font-mono', colors[state] ?? 'bg-ice-line/[0.06] text-ice-faint')} style={{ fontSize: '11px' }}>
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
  const activePositions = positions.filter((p) => p.marketState === MarketState.Trading);
  const finalizedPositions = positions.filter(
    (p) => p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary,
  );

  const totalValue = positions.reduce((s, p) => {
    const isFinalized = p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary;
    const isFinLoss = isFinalized && p.isWinner === false;
    if (isFinLoss) return s;
    const isFinWin = isFinalized && p.isWinner === true;
    return s + (isFinWin ? p.quantity : p.currentValue);
  }, 0n);

  const unrealizedPnl = activePositions.reduce((s, p) => s + (p.currentValue - p.costBasis), 0n);
  const unrealizedCost = activePositions.reduce((s, p) => s + p.costBasis, 0n);
  const unrealizedDollars = Number(unrealizedPnl) / 1e6;
  const unrealizedCostDollars = Number(unrealizedCost) / 1e6;
  const unrealizedPercent = unrealizedCostDollars > 0 ? (unrealizedDollars / unrealizedCostDollars) * 100 : 0;
  const unrealizedUp = unrealizedPnl >= 0n;

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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-ice-surface border border-ice-line/15 rounded-xl">
        <ClaimTestUsdcButton />
      </div>

      {/* Row 2: Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Value" value={formatUsdc(totalValue)} accent="ice" />
        <StatCard
          label="Unrealized P&L"
          value={`${unrealizedUp ? '+' : ''}$${unrealizedDollars.toFixed(2)} (${unrealizedUp ? '+' : ''}${unrealizedPercent.toFixed(1)}%)`}
          valueColor={unrealizedUp ? 'text-ice-up' : 'text-ice-down'}
          accent={unrealizedUp ? 'green' : 'red'}
        />
        <StatCard
          label="Realized P&L"
          value={`${realizedUp ? '+' : ''}$${realizedDollars.toFixed(2)} (${realizedUp ? '+' : ''}${realizedPercent.toFixed(1)}%)`}
          valueColor={realizedUp ? 'text-ice-up' : 'text-ice-down'}
          accent={realizedUp ? 'green' : 'red'}
        />
        <StatCard label="Positions">
          <div className="mt-1 space-y-0.5">
            <div className="text-ice-text font-mono font-medium" style={{ fontSize: '15px' }}>
              {activePositions.length} Active
            </div>
            <div className="text-ice-faint font-mono" style={{ fontSize: '13px' }}>
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
    ice: 'border-l-2 border-l-ice-accent/40',
    green: 'border-l-2 border-l-ice-up/40',
    red: 'border-l-2 border-l-ice-down/40',
  };
  return (
    <div className={cn('bg-ice-surface border border-ice-line/15 rounded-xl px-4 py-3', accent && accentClasses[accent])}>
      <div className="text-ice-faint font-mono uppercase" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>
        {label}
      </div>
      {children ?? (
        <div className={cn('font-mono font-medium mt-1', valueColor ?? 'text-ice-text')} style={{ fontSize: '16px' }}>
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

  const activePositions = positions.filter((p) => p.marketState === MarketState.Trading);
  const settledPositions = positions.filter((p) => p.marketState !== MarketState.Trading);

  const sortByRecent = (a: PositionDisplay, b: PositionDisplay) =>
    b.marketId - a.marketId || b.positionId - a.positionId;
  activePositions.sort(sortByRecent);
  settledPositions.sort(sortByRecent);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {!isConnected ? (
        <div className="flex items-center justify-center min-h-[65vh]">
          <div className="w-full max-w-md rounded-2xl bg-ice-surface border border-ice-line/15 p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-ice-accent" />
            </div>
            <h2 className="text-ice-text text-xl font-bold mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              Sign in to view your positions
            </h2>
            <p className="text-ice-muted mb-8 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              Your open and settled options positions, P&L, and claimable payouts live here.
            </p>
            <button
              onClick={() => handleLogin()}
              className="px-6 py-3 rounded-xl font-semibold transition-transform hover:-translate-y-px"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '15px',
                background: 'linear-gradient(180deg, #8be4ff 0%, #4db8ff 100%)',
                color: '#06223a',
                boxShadow: '0 2px 16px rgba(139,228,255,0.3)',
              }}
            >
              Sign In
            </button>
          </div>
        </div>
      ) : positionsLoading ? (
        <div className="space-y-4">
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
              <div key={i} className="bg-ice-surface border border-ice-line/15 p-5 rounded-2xl space-y-4">
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
            <div className="flex items-center justify-center text-center p-12 rounded-2xl bg-ice-surface border border-ice-line/15 text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              No open positions yet — head to Options to place your first trade.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Positions */}
              {activePositions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-ice-up" />
                    <h3 className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
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
                  <ClaimAllSection positions={settledPositions} />

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

function ClaimAllSection({ positions }: { positions: PositionDisplay[] }) {
  const chainId = useChainId();
  const { switchForTab } = useChainSwitch();
  const { step, error: execError, batchClaimPayout, reset } = useOptionsTrading();
  const isWrongChain = chainId !== CHAIN_IDS.FUJI;

  const claimable = positions.filter(
    (p) =>
      !p.claimed &&
      p.isWinner === true &&
      (p.marketState === MarketState.FinalizedPrimary || p.marketState === MarketState.FinalizedSecondary),
  );

  const handleClaimAll = useCallback(async () => {
    if (isWrongChain) {
      await switchForTab('options');
      return;
    }
    if (step === 'error') {
      reset();
      return;
    }
    await batchClaimPayout(claimable.map((p) => p.positionId));
  }, [isWrongChain, switchForTab, step, reset, batchClaimPayout, claimable]);

  const isBusy = step === 'claiming';

  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-2 h-2 rounded-full bg-ice-faint" />
      <h3 className="text-ice-muted font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
        Settled ({positions.length})
      </h3>
      {claimable.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); handleClaimAll(); }}
          disabled={isBusy}
          className={cn(
            'ml-auto px-4 py-1.5 rounded-lg font-medium text-sm transition-colors border',
            isBusy
              ? 'bg-ice-line/[0.06] text-ice-faint border-transparent cursor-not-allowed'
              : 'bg-ice-accent/10 text-ice-accent border-ice-line/30 hover:bg-ice-accent/20',
          )}
          style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
        >
          {isBusy ? 'Claiming...' : step === 'error' ? 'Retry' : `Claim All (${claimable.length})`}
        </button>
      )}
      {step === 'error' && execError && (
        <span className="text-ice-down text-xs ml-2">{execError}</span>
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
        'bg-ice-surface border rounded-2xl overflow-hidden cursor-pointer transition-all',
        isActive
          ? 'border-ice-up/20 hover:border-ice-up/30 hover:bg-ice-surface2'
          : 'border-ice-line/15 hover:border-ice-line/30 hover:bg-ice-surface2',
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
            <div className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
              {market ? `${market.assetSymbol}/USD` : `Market #${p.marketId}`}
            </div>
            <div className="text-ice-faint font-mono" style={{ fontSize: '12px' }}>
              Position #{p.positionId}
            </div>
          </div>
          <StateBadge state={p.marketState} label={stateLabel} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Range</span>
            <span className="text-ice-text font-mono" style={{ fontSize: '13px' }}>
              {formatTickAsPrice(p.lowerTick, p.tickDivisor)} – {formatTickAsPrice(p.upperTick, p.tickDivisor)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Payout units</span>
            <span className="text-ice-muted font-mono" style={{ fontSize: '13px' }}>
              {(Number(p.quantity) / 1e6).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Cost Basis</span>
            <span className="text-ice-muted font-mono" style={{ fontSize: '13px' }}>
              {formatUsdc(p.costBasis)}
            </span>
          </div>
          {/* P&L row */}
          <div className="flex items-center justify-between">
            <span className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>P&L</span>
            <span className={cn('font-mono font-medium', isProfitable ? 'text-ice-up' : 'text-ice-down')} style={{ fontSize: '13px' }}>
              {isProfitable ? '+' : ''}{`$${pnlDollars.toFixed(2)}`} ({isProfitable ? '+' : ''}{pnlPercent.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-ice-line/[0.06]">
            <span className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              {isLoser ? 'Payout' : 'Value'}
            </span>
            <span className={cn('font-mono font-semibold', isLoser ? 'text-ice-down' : 'text-ice-text')} style={{ fontSize: '16px' }}>
              {isLoser ? '$0.00' : formatUsdc(canClaim ? p.quantity : p.currentValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Action area */}
      {(canClose || canClaim) && (
        <div className="px-5 pb-5" onClick={(e) => e.stopPropagation()}>
          {execError && (
            <div className="flex items-center gap-2 p-2 mb-3 bg-ice-down/10 border border-ice-down/20 rounded-lg">
              <span className="text-ice-down" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                {execError}
              </span>
            </div>
          )}
          <button
            onClick={handleAction}
            disabled={isActionDisabled}
            className={cn(
              'w-full px-4 py-3 rounded-xl font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-2 border',
              isActionDisabled
                ? 'bg-ice-line/[0.06] text-ice-faint border-transparent cursor-not-allowed'
                : canClaim
                ? 'bg-ice-accent/10 text-ice-accent border-ice-line/30 hover:bg-ice-accent/20'
                : 'bg-ice-down/10 text-ice-down border-ice-down/20 hover:bg-ice-down/20',
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
              className="block text-center mt-2 text-ice-faint hover:text-ice-text transition-colors"
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
          <div className="w-full px-4 py-3 bg-ice-down/10 text-ice-down rounded-xl font-medium text-center" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
            Lost
          </div>
        </div>
      )}

      {/* Claimed badge */}
      {p.claimed && (
        <div className="px-5 pb-5">
          <div className="w-full px-4 py-3 bg-ice-line/[0.06] text-ice-faint rounded-xl font-medium text-center" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
            Claimed
          </div>
        </div>
      )}
    </div>
  );
}
