import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Target } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { useOptionsMarkets } from '@/app/hooks/useOptionsMarkets';
import { useOptionsPositions } from '@/app/hooks/useOptionsPositions';
import { MarketState, type PositionDisplay, type MarketDisplay } from '@/app/types/options';
import { formatUsdc } from '@/app/utils/options';
import { ClaimTestUsdcButton } from '@/app/components/options-view';
import { AssetLogo, MarketStateBadge } from '@/app/components/option-market-card';
import { EmptyState } from '@/app/components/shell/empty-state';
// One card implementation for both the trade page and this page, so a position shows the
// same numbers (and the same slippage-protected close) wherever the user sees it.
import { PositionCard, ClaimAllButton } from '@/app/components/options/trade-position-card';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
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
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl bg-ice-line/[0.05] text-[13px]">
        <span className="inline-flex items-center gap-2 text-ice-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
          Fuji testnet
        </span>
        <ClaimTestUsdcButton />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total value" value={formatUsdc(totalValue)} />
        <StatCard
          label="Unrealized P&L"
          value={`${unrealizedUp ? '+' : '−'}$${Math.abs(unrealizedDollars).toFixed(2)}`}
          detail={`${unrealizedUp ? '+' : '−'}${Math.abs(unrealizedPercent).toFixed(1)}%`}
          valueColor={unrealizedUp ? 'text-ice-up' : 'text-ice-down'}
        />
        <StatCard
          label="Realized P&L"
          value={`${realizedUp ? '+' : '−'}$${Math.abs(realizedDollars).toFixed(2)}`}
          detail={`${realizedUp ? '+' : '−'}${Math.abs(realizedPercent).toFixed(1)}%`}
          valueColor={realizedUp ? 'text-ice-up' : 'text-ice-down'}
        />
        <StatCard label="Positions" value={`${activePositions.length} active`} detail={`${settledCount} settled`} />
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, valueColor }: { label: string; value: string; detail?: string; valueColor?: string }) {
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-4 flex flex-col gap-1.5">
      <span className="text-ice-muted text-[13px]">{label}</span>
      <span className={cn('font-semibold tabular-nums leading-none tracking-[-0.01em] text-[20px]', valueColor ?? 'text-ice-text')}>{value}</span>
      {detail && <span className={cn('text-[12px] tabular-nums', valueColor ?? 'text-ice-faint')}>{detail}</span>}
    </div>
  );
}

/** Positions of one market: a header with the asset and market state, then the shared cards. */
function MarketGroup({ marketId, market, positions }: { marketId: number; market?: MarketDisplay; positions: PositionDisplay[] }) {
  const state = positions[0]?.marketState ?? MarketState.Trading;
  const stateLabel =
    market?.stateLabel ?? (isFinalizedState(state) ? 'Finalized' : state === MarketState.Trading ? 'Live' : 'Pending');
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 p-3 sm:p-4">
      <div className="flex items-center gap-3 mb-3">
        <AssetLogo src={market?.assetLogo ?? ''} symbol={market?.assetSymbol ?? '?'} />
        <div className="flex-1 min-w-0">
          <div className="text-ice-text font-semibold text-[15px]">
            {market ? `${market.assetSymbol}/USD` : `Market #${marketId}`}
          </div>
          <div className="text-ice-muted text-[13px] tabular-nums">
            Market #{marketId} · {positions.length} {positions.length === 1 ? 'position' : 'positions'}
          </div>
        </div>
        <MarketStateBadge state={state} label={stateLabel} />
        <Link
          to={`/predict/${marketId}`}
          className="hidden sm:inline-flex items-center gap-1 min-h-[44px] px-2 text-ice-accent text-[14px] font-medium"
        >
          Open <ArrowRight className="w-4 h-4" />
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

/** Options positions grouped by market. Rendered inside the Portfolio tab, which owns the sign-in gate. */
export function PositionsContent() {
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
    <div>
      {positionsLoading ? (
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
            <EmptyState
              icon={<Target className="w-6 h-6" />}
              title="No positions yet"
              message="Pick a price range on a live market to open your first position."
              action={{ label: 'Browse markets', href: '/predict' }}
            />
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
