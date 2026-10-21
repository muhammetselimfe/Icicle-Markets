import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ArrowRight } from 'lucide-react';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { useOptionsPositions } from '@/app/hooks/useOptionsPositions';
import { MarketState, type PositionDisplay, type MarketDisplay } from '@/app/types/options';
import { formatUsdc } from '@/app/utils/options';
import { ClaimTestUsdcButton } from '@/app/components/options-view';
// One card implementation for both the trade page and this page, so a position shows the
// same numbers (and the same slippage-protected close) wherever the user sees it.
import { PositionCard, ClaimAllButton } from '@/app/components/options/trade-position-card';

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
    <span className={cn('px-2.5 py-1 rounded-md font-mono text-[11px]', colors[state] ?? 'bg-ice-line/[0.06] text-ice-faint')}>
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

const isFinalizedState = (s: MarketState) =>
  s === MarketState.FinalizedPrimary || s === MarketState.FinalizedSecondary;

function PortfolioSummary({ positions }: { positions: PositionDisplay[] }) {
  const activePositions = positions.filter((p) => p.marketState === MarketState.Trading);
  const finalizedPositions = positions.filter((p) => isFinalizedState(p.marketState));

  const totalValue = positions.reduce((s, p) => {
    const isFinalized = isFinalizedState(p.marketState);
    if (isFinalized && p.isWinner === false) return s;
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

  const settledCount = positions.length - activePositions.length;

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
            <div className="text-ice-text font-mono font-medium text-[15px]">
              {activePositions.length} Active
            </div>
            <div className="text-ice-faint font-mono text-[13px]">
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
      <div className="text-ice-faint font-mono uppercase text-[10px] tracking-[0.8px]">
        {label}
      </div>
      {children ?? (
        <div className={cn('font-mono font-medium mt-1 text-[16px]', valueColor ?? 'text-ice-text')}>
          {value}
        </div>
      )}
    </div>
  );
}

/** Positions of one market: a header with the asset and market state, then the shared cards. */
function MarketGroup({ marketId, market, positions }: { marketId: number; market?: MarketDisplay; positions: PositionDisplay[] }) {
  const state = positions[0]?.marketState ?? MarketState.Trading;
  const stateLabel =
    market?.stateLabel ?? (isFinalizedState(state) ? 'Finalized' : state === MarketState.Trading ? 'Live' : 'Pending');
  return (
    <div className="bg-ice-surface/40 border border-ice-line/10 rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-3 mb-3">
        {market ? (
          <AssetLogo src={market.assetLogo} symbol={market.assetSymbol} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">?</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-ice-text font-semibold text-[15px]">
            {market ? `${market.assetSymbol}/USD` : `Market #${marketId}`}
          </div>
          <div className="text-ice-faint font-mono text-[12px]">
            Market #{marketId} · {positions.length} {positions.length === 1 ? 'position' : 'positions'}
          </div>
        </div>
        <StateBadge state={state} label={stateLabel} />
        <Link
          to={`/options/trade/${marketId}`}
          className="hidden sm:flex items-center gap-1 text-ice-muted hover:text-ice-text transition-colors text-[13px]"
        >
          Open <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {positions.map((p) => (
          <PositionCard key={p.positionId} position={p} tickDivisor={p.tickDivisor} />
        ))}
      </div>
    </div>
  );
}

function groupByMarket(positions: PositionDisplay[]): { marketId: number; positions: PositionDisplay[] }[] {
  const groups = new Map<number, PositionDisplay[]>();
  for (const p of positions) {
    const list = groups.get(p.marketId) ?? [];
    list.push(p);
    groups.set(p.marketId, list);
  }
  // Newest market first, newest position first inside each group
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([marketId, list]) => ({ marketId, positions: list.sort((a, b) => b.positionId - a.positionId) }));
}

function SectionHeading({ dotClass, children }: { dotClass: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn('w-2 h-2 rounded-full', dotClass)} />
      {children}
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
  const { positions, loading: positionsLoading, error: positionsError } = useOptionsPositions();

  const marketMap = useMemo(() => new Map(markets.map((m) => [m.marketId, m])), [markets]);

  // Three buckets: still trading, past trading but not finalized yet, finalized.
  const { active, awaiting, settled } = useMemo(() => {
    const active = positions.filter((p) => p.marketState === MarketState.Trading);
    const settled = positions.filter((p) => isFinalizedState(p.marketState));
    const awaiting = positions.filter((p) => p.marketState !== MarketState.Trading && !isFinalizedState(p.marketState));
    return { active: groupByMarket(active), awaiting: groupByMarket(awaiting), settled: groupByMarket(settled) };
  }, [positions]);

  const settledFlat = settled.flatMap((g) => g.positions);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      {!isConnected ? (
        <div className="flex items-center justify-center min-h-[65vh]">
          <div className="w-full max-w-md rounded-2xl bg-ice-surface border border-ice-line/15 p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-ice-accent" />
            </div>
            <h2 className="text-ice-text text-xl font-bold mb-3">
              Sign in to view your positions
            </h2>
            <p className="text-ice-muted mb-8 leading-relaxed text-[15px]">
              Your open and settled options positions, P&L, and claimable payouts live here.
            </p>
            <button
              onClick={() => handleLogin()}
              className="px-6 py-3 rounded-xl font-semibold transition-transform hover:-translate-y-px text-[15px]"
              style={{
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

          {positionsError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-ice-down/10 border border-ice-down/20 text-ice-down text-[13px]">
              Could not load positions: {positionsError}
            </div>
          )}

          {positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 rounded-2xl bg-ice-surface border border-ice-line/15 text-ice-muted text-[15px] gap-3">
              <span>No open positions yet.</span>
              <Link to="/options" className="text-ice-accent hover:underline text-[14px]">
                Browse markets to place your first trade
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {active.length > 0 && (
                <div>
                  <SectionHeading dotClass="bg-ice-up">
                    <h3 className="text-ice-text font-semibold text-[15px]">
                      Active ({active.reduce((n, g) => n + g.positions.length, 0)})
                    </h3>
                  </SectionHeading>
                  <div className="space-y-4">
                    {active.map((g) => (
                      <MarketGroup key={g.marketId} marketId={g.marketId} market={marketMap.get(g.marketId)} positions={g.positions} />
                    ))}
                  </div>
                </div>
              )}

              {awaiting.length > 0 && (
                <div>
                  <SectionHeading dotClass="bg-yellow-400">
                    <h3 className="text-ice-muted font-semibold text-[15px]">
                      Awaiting settlement ({awaiting.reduce((n, g) => n + g.positions.length, 0)})
                    </h3>
                    <span className="text-ice-faint text-[12px]">Trading has ended; payouts unlock once the oracle settles.</span>
                  </SectionHeading>
                  <div className="space-y-4">
                    {awaiting.map((g) => (
                      <MarketGroup key={g.marketId} marketId={g.marketId} market={marketMap.get(g.marketId)} positions={g.positions} />
                    ))}
                  </div>
                </div>
              )}

              {settled.length > 0 && (
                <div>
                  <SectionHeading dotClass="bg-ice-faint">
                    <h3 className="text-ice-muted font-semibold text-[15px]">
                      Settled ({settledFlat.length})
                    </h3>
                    <ClaimAllButton positions={settledFlat} />
                  </SectionHeading>
                  <div className="space-y-4">
                    {settled.map((g) => (
                      <MarketGroup key={g.marketId} marketId={g.marketId} market={marketMap.get(g.marketId)} positions={g.positions} />
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
