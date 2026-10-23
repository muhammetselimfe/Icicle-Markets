import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ArrowRightLeft,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/app/components/shell/page-header';
import { SegmentedControl } from '@/app/components/shell/segmented-control';
import { SignInGate } from '@/app/components/shell/sign-in-gate';
import { EmptyState } from '@/app/components/shell/empty-state';
import { WalletAvatar } from '@/app/components/shell/wallet-avatar';
import { TokenLogo } from '@/app/components/shell/token-logo';
import { TransactionTypeIcon, TX_TYPE_LABELS } from '@/app/components/shell/transaction-type';
import { ErrorState } from '@/app/components/ui/data-states';
import { PositionsContent } from '@/app/components/positions-view';
import { usePortfolio, type PortfolioHolding } from '@/app/hooks/usePortfolio';
import { getTokenByAddress } from '@/app/data/markets-tokens';
import { useTransactionHistory, type Transaction } from '@/app/hooks/useTransactionHistory';
import { SwapModal } from '@/app/components/swap-modal';
import { cn } from '@/app/components/ui/utils';

// ── Formatting ───────────────────────────────────────────────────────────────

function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatUsd(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return value < 0 ? '-<$0.01' : '<$0.01';
  return `${value < 0 ? '-' : ''}$${formatNumber(Math.abs(value))}`;
}

function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  return formatNumber(num, 2);
}

function formatPrice(price: number): string {
  return price < 0.01 ? `$${price.toFixed(6)}` : `$${formatNumber(price)}`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Change({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', up ? 'text-ice-up' : 'text-ice-down', className)}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 divide-y divide-ice-line/10">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 md:px-5 h-[68px]">
          <div className="w-10 h-10 rounded-full bg-ice-line/[0.08] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-24 rounded bg-ice-line/[0.08] animate-pulse" />
            <div className="h-3 w-32 rounded bg-ice-line/[0.06] animate-pulse" />
          </div>
          <div className="h-3.5 w-20 rounded bg-ice-line/[0.08] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export interface PortfolioHeroProps {
  address: string;
  totalValue: number;
  change24h: number;
  activeSince: Date | null;
}

/** Identity and headline number for the wallet. */
export function PortfolioHero({ address, totalValue, change24h, activeSince }: PortfolioHeroProps) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const changeValue = totalValue * (change24h / 100);

  return (
    <section className="mb-6 rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <WalletAvatar address={address} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-ice-text font-medium font-mono text-[15px]">{truncateAddress(address)}</span>
            <button type="button" onClick={copy} className="w-8 h-8 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors" aria-label="Copy address">
              {copied ? <Check className="w-4 h-4 text-ice-up" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={`https://snowtrace.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ice-muted hover:text-ice-text hover:bg-ice-line/[0.08] transition-colors"
              aria-label="View on Snowtrace"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <div className="flex items-center gap-2 text-ice-muted text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E84142]" />
              Avalanche
            </span>
            {activeSince && (
              <>
                <span className="text-ice-faint">·</span>
                <span>Since {formatDate(activeSince)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="text-ice-muted text-[13px] mb-1">Total value</div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ice-text font-bold tabular-nums tracking-[-0.02em] text-[34px] md:text-[40px] leading-none">{formatUsd(totalValue)}</span>
        <span className="text-[14px] font-medium">
          <Change value={change24h} />
          <span className="text-ice-faint tabular-nums"> ({formatUsd(changeValue)}) today</span>
        </span>
      </div>
    </section>
  );
}

// ── Holdings ─────────────────────────────────────────────────────────────────

export function HoldingsList({
  holdings,
  loading,
  error,
  onRefetch,
  onTrade,
}: {
  holdings: PortfolioHolding[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
  onTrade: (holding: PortfolioHolding) => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRefetch} />;
  if (loading && holdings.length === 0) return <SkeletonRows />;
  if (holdings.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="w-6 h-6" />}
        title="No tokens yet"
        message="Tokens you hold on Avalanche show up here."
        action={{ label: 'Browse markets', href: '/' }}
      />
    );
  }

  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
      {/* Column captions, wide screens only */}
      <div className="hidden md:grid grid-cols-[1fr_140px_110px_130px_88px] gap-4 px-5 h-9 items-center border-b border-ice-line/10 text-ice-faint text-[12px]">
        <span>Asset</span>
        <span className="text-right">Balance</span>
        <span className="text-right">24h</span>
        <span className="text-right">Value</span>
        <span />
      </div>
      <ul className="divide-y divide-ice-line/10">
        {holdings.map((h) => (
          <li key={h.address} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_140px_110px_130px_88px] items-center gap-3 md:gap-4 px-4 md:px-5 min-h-[68px] py-3">
            <Link to={getTokenByAddress(h.address)?.coingeckoId ? `/token/${getTokenByAddress(h.address)!.coingeckoId}` : `/address/${h.address}`} className="flex items-center gap-3 min-w-0 group">
              <TokenLogo symbol={h.symbol} logoUrl={h.logoUrl} />
              <div className="min-w-0">
                <div className="text-ice-text font-semibold text-[15px] leading-tight group-hover:text-ice-accent transition-colors">{h.symbol}</div>
                <div className="text-ice-muted text-[13px] truncate">
                  <span className="md:hidden tabular-nums">{formatBalance(h.balance)} {h.symbol}</span>
                  <span className="hidden md:inline">{h.name}</span>
                </div>
              </div>
            </Link>

            {/* Phone: value and change stacked on the trailing edge */}
            <div className="md:hidden text-right">
              <div className="text-ice-text font-semibold tabular-nums text-[15px]">{formatUsd(h.valueUsd)}</div>
              <Change value={h.change24h} className="text-[13px]" />
            </div>

            <div className="hidden md:block text-right">
              <div className="text-ice-text tabular-nums text-[14px]">{formatBalance(h.balance)}</div>
              <div className="text-ice-faint tabular-nums text-[12px]">{formatPrice(h.priceUsd)}</div>
            </div>
            <div className="hidden md:block text-right text-[14px]">
              <Change value={h.change24h} />
            </div>
            <div className="hidden md:block text-right text-ice-text font-semibold tabular-nums text-[15px]">{formatUsd(h.valueUsd)}</div>
            <div className="hidden md:flex justify-end">
              <button
                type="button"
                onClick={() => onTrade(h)}
                className="h-9 px-4 rounded-full bg-ice-accent/[0.12] text-ice-accent hover:bg-ice-accent/20 transition-colors text-[13px] font-semibold"
              >
                Trade
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

export function ActivityList({
  transactions,
  loading,
  error,
  onRefetch,
  hasMore,
  onLoadMore,
}: {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRefetch} />;
  if (loading && transactions.length === 0) return <SkeletonRows rows={6} />;
  if (transactions.length === 0) {
    return <EmptyState icon={<ArrowRightLeft className="w-6 h-6" />} title="No activity yet" message="Swaps, transfers and approvals from this wallet show up here." />;
  }

  return (
    <div className="rounded-2xl bg-ice-surface border border-ice-line/15 overflow-hidden">
      <ul className="divide-y divide-ice-line/10">
        {transactions.map((tx) => {
          // Outgoing legs come first; a swap shows what left and what arrived.
          const legs = tx.transfers.slice(0, 2);
          return (
            <li key={tx.hash}>
              <Link
                to={`/tx/${tx.hash}`}
                className={cn('flex items-center gap-3 md:gap-4 px-4 md:px-5 min-h-[68px] py-3 hover:bg-ice-line/[0.05] transition-colors', (tx.status === 'failed' || tx.type === 'suspicious') && 'opacity-60')}
              >
                <span className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden', tx.type === 'suspicious' ? 'bg-ice-down/10 text-ice-down' : 'bg-ice-line/[0.08] text-ice-muted')}>
                  {tx.protocol?.logoUrl ? <img src={tx.protocol.logoUrl} alt="" className="w-6 h-6 rounded-full" /> : <TransactionTypeIcon type={tx.type} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-ice-text font-semibold text-[15px] shrink-0">{tx.title ?? TX_TYPE_LABELS[tx.type]}</span>
                    <span className="text-ice-muted text-[13px] truncate">{tx.context}</span>
                    {tx.status === 'failed' && <span className="px-1.5 h-5 inline-flex items-center rounded-md bg-ice-down/10 text-ice-down text-[11px] font-medium shrink-0">Failed</span>}
                  </span>
                  <span className="block text-ice-faint text-[13px] truncate">
                    {tx.type === 'contract' && tx.method ? `${tx.method} · ` : ''}
                    {tx.type === 'suspicious' ? 'Fake token event, do not copy addresses · ' : ''}
                    {formatRelativeTime(tx.timestamp)}
                  </span>
                </span>
                {legs.length > 0 && (
                  <span className="text-right shrink-0 space-y-0.5">
                    {legs.map((leg, i) => {
                      const out = leg.direction === 'out';
                      return (
                        <span key={i} className="flex items-baseline justify-end gap-2">
                          {leg.valueUsd > 0 && <span className="hidden sm:inline text-ice-faint tabular-nums text-[12px]">{formatUsd(leg.valueUsd)}</span>}
                          <span className={cn('font-medium tabular-nums text-[14px]', out ? 'text-ice-text' : 'text-ice-up')}>
                            {out ? '−' : '+'}
                            {leg.amount} {leg.symbol}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-ice-faint shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore && onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="w-full min-h-[48px] border-t border-ice-line/10 text-ice-accent text-[14px] font-medium hover:bg-ice-line/[0.05] transition-colors disabled:text-ice-faint"
        >
          {loading ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Segment = 'holdings' | 'positions' | 'activity';
const SEGMENTS: Segment[] = ['holdings', 'positions', 'activity'];

export function PortfolioView() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const navigate = useNavigate();
  const params = useParams<{ segment?: string }>();
  const segment: Segment = SEGMENTS.includes(params.segment as Segment) ? (params.segment as Segment) : 'holdings';
  const setSegment = (next: Segment) => navigate(next === 'holdings' ? '/portfolio' : `/portfolio/${next}`, { replace: true });

  const { holdings, totalValue, totalChange24h, loading: holdingsLoading, error: holdingsError, lastUpdated, txCount, activeSince, refetch: refetchHoldings } = usePortfolio();
  const { transactions, loading: txLoading, error: txError, refetch: refetchTx, hasMore, loadMore } = useTransactionHistory();

  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address?: string } | null>(null);

  const handleTradeClick = (holding: PortfolioHolding) => {
    setSelectedToken({ symbol: holding.symbol, address: holding.address });
    setSwapModalOpen(true);
  };

  const handleRefresh = () => {
    refetchHoldings();
    refetchTx();
  };

  if (!authenticated || !address) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-4xl">
        <PageHeader title="Portfolio" subtitle="Your holdings, prediction positions, and activity in one place" />
        <SignInGate
          title="Sign in to see your portfolio"
          message="Spot holdings, prediction-market positions, and your transaction history, all in one place."
        />
      </div>
    );
  }

  const refreshing = holdingsLoading || txLoading;

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-4xl">
      <PageHeader
        title="Portfolio"
        trailing={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors px-3 min-h-[44px] rounded-full hover:bg-ice-line/[0.06] disabled:text-ice-faint"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline text-[13px]">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Refresh'}
            </span>
          </button>
        }
      />

      <PortfolioHero address={address} totalValue={totalValue} change24h={totalChange24h} activeSince={activeSince} />

      <SegmentedControl
        aria-label="Portfolio sections"
        className="mb-4"
        fullWidth
        value={segment}
        onChange={setSegment}
        segments={[
          { id: 'holdings', label: 'Holdings', badge: holdings.length || undefined },
          { id: 'positions', label: 'Positions' },
          { id: 'activity', label: 'Activity', badge: txCount !== null ? txCount.toLocaleString('en-US') : undefined },
        ]}
      />

      {segment === 'holdings' && (
        <HoldingsList holdings={holdings} loading={holdingsLoading} error={holdingsError} onRefetch={refetchHoldings} onTrade={handleTradeClick} />
      )}
      {segment === 'positions' && <PositionsContent />}
      {segment === 'activity' && (
        <ActivityList transactions={transactions} loading={txLoading} error={txError} onRefetch={refetchTx} hasMore={hasMore} onLoadMore={loadMore} />
      )}

      <SwapModal
        isOpen={swapModalOpen}
        onClose={() => {
          setSwapModalOpen(false);
          setSelectedToken(null);
        }}
        initialToToken={selectedToken ?? undefined}
      />
    </div>
  );
}
