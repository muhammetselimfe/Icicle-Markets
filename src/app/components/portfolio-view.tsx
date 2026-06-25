import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Layers,
  FileCode,
} from 'lucide-react';
import { usePortfolio, type PortfolioHolding } from '@/app/hooks/usePortfolio';
import { useTransactionHistory, type Transaction, type TransactionType } from '@/app/hooks/useTransactionHistory';
import { SwapModal } from '@/app/components/swap-modal';
import { cn } from '@/app/components/ui/utils';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCompactNumber(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) < 0.01) return value < 0 ? '-<$0.01' : '<$0.01';
  return `$${formatNumber(Math.abs(value))}`;
}

function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  return formatNumber(num, 2);
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================
// AVATAR COMPONENT - Generates a unique pattern based on address
// ============================================================

function WalletAvatar({ address, size = 48 }: { address: string; size?: number }) {
  const colors = useMemo(() => {
    const hash = address.toLowerCase();
    const c1 = `#${hash.slice(2, 8)}`;
    const c2 = `#${hash.slice(8, 14)}`;
    const c3 = `#${hash.slice(14, 20)}`;
    return [c1, c2, c3];
  }, [address]);

  const pattern = useMemo(() => {
    const hash = address.toLowerCase();
    const positions: { x: number; y: number; color: string; size: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const charCode = hash.charCodeAt(i + 2);
      positions.push({
        x: (i % 3) * 33.33,
        y: Math.floor(i / 3) * 33.33,
        color: colors[charCode % 3],
        size: 33.33,
      });
    }
    return positions;
  }, [address, colors]);

  return (
    <div
      className="relative overflow-hidden rounded-full ring-1 ring-ice-line/20"
      style={{ width: size, height: size, background: '#141c3d' }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        {pattern.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.size} height={p.size} fill={p.color} opacity={0.85} />
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// TOKEN LOGO COMPONENT
// ============================================================

function TokenLogo({ holding }: { holding: PortfolioHolding }) {
  return (
    <div className="w-10 h-10 bg-white/10 flex items-center justify-center overflow-hidden rounded-full">
      {holding.logoUrl ? (
        <img
          src={holding.logoUrl}
          alt={holding.symbol}
          className="w-8 h-8 object-contain rounded-full"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <span className={`text-lg text-ice-text ${holding.logoUrl ? 'hidden' : ''}`}>{holding.symbol.charAt(0)}</span>
    </div>
  );
}

// ============================================================
// TRANSACTION ICON COMPONENT
// ============================================================

function TransactionIcon({ type }: { type: TransactionType }) {
  const icons: Record<TransactionType, React.ReactNode> = {
    swap: <ArrowRightLeft className="w-5 h-5" />,
    send: <ArrowUpRight className="w-5 h-5" />,
    receive: <ArrowDownLeft className="w-5 h-5" />,
    approve: <ShieldCheck className="w-5 h-5" />,
    stake: <Layers className="w-5 h-5" />,
    unstake: <Layers className="w-5 h-5" />,
    contract: <FileCode className="w-5 h-5" />,
  };

  return <span className="text-ice-muted">{icons[type] || <ArrowRightLeft className="w-5 h-5" />}</span>;
}

// ============================================================
// STATE COMPONENTS
// ============================================================

function LoadingState() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-ice-surface border border-ice-line/15 rounded-full flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-ice-accent animate-spin" />
          </div>
          <h2 className="text-ice-text text-lg font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
            Loading portfolio...
          </h2>
          <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
            Fetching your wallet data
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="p-10 text-center rounded-2xl bg-ice-surface border border-ice-line/15">
      <AlertCircle className="w-10 h-10 text-ice-down mx-auto mb-4" />
      <p className="text-ice-text mb-4" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
        {error}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-all rounded-lg"
        style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500 }}
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  );
}

function EmptyHoldingsState() {
  return (
    <div className="p-12 text-center rounded-2xl bg-ice-surface border border-ice-line/15">
      <div className="w-14 h-14 mx-auto mb-4 bg-ice-accent/[0.08] border border-ice-line/15 rounded-full flex items-center justify-center">
        <Wallet className="w-7 h-7 text-ice-accent" />
      </div>
      <h3 className="text-ice-text font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
        No tokens found
      </h3>
      <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
        Your wallet doesn't hold any tracked tokens
      </p>
    </div>
  );
}

function EmptyTransactionsState() {
  return (
    <div className="p-12 text-center rounded-2xl bg-ice-surface border border-ice-line/15">
      <div className="w-14 h-14 mx-auto mb-4 bg-ice-accent/[0.08] border border-ice-line/15 rounded-full flex items-center justify-center">
        <ArrowRightLeft className="w-7 h-7 text-ice-accent" />
      </div>
      <h3 className="text-ice-text font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px' }}>
        No transactions
      </h3>
      <p className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
        No recent transactions found
      </p>
    </div>
  );
}

// ============================================================
// HOLDINGS TAB CONTENT
// ============================================================

function HoldingsTab({
  holdings,
  loading,
  error,
  onRefetch,
  onTradeClick,
}: {
  holdings: PortfolioHolding[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
  onTradeClick: (holding: PortfolioHolding) => void;
}) {
  if (error) {
    return <ErrorState error={error} onRetry={onRefetch} />;
  }

  if (!loading && holdings.length === 0) {
    return <EmptyHoldingsState />;
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {holdings.map((holding) => (
          <div key={holding.address} className="bg-ice-surface border border-ice-line/15 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <TokenLogo holding={holding} />
                <div>
                  <div className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                    {holding.symbol}
                  </div>
                  <div className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                    {holding.name}
                  </div>
                </div>
              </div>
              <span
                className={cn('font-mono font-medium', holding.change24h >= 0 ? 'text-ice-up' : 'text-ice-down')}
                style={{ fontSize: '14px' }}
              >
                {holding.change24h >= 0 ? '+' : ''}{holding.change24h.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-ice-text font-mono font-medium" style={{ fontSize: '16px' }}>
                  ${formatNumber(holding.valueUsd)}
                </div>
                <div className="text-ice-muted font-mono" style={{ fontSize: '13px' }}>
                  {formatBalance(holding.balance)} {holding.symbol}
                </div>
              </div>
              <button
                onClick={() => onTradeClick(holding)}
                className="px-4 py-2.5 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-all rounded-lg font-semibold min-h-[44px]"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
              >
                Trade
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-ice-surface border border-ice-line/15 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-ice-surface2/40 border-b border-ice-line/15">
                <th className="text-left px-4 py-3 font-mono uppercase text-ice-faint" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>Asset</th>
                <th className="text-right px-4 py-3 font-mono uppercase text-ice-faint" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>Balance</th>
                <th className="text-right px-4 py-3 font-mono uppercase text-ice-faint" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>Value</th>
                <th className="text-right px-4 py-3 font-mono uppercase text-ice-faint" style={{ fontSize: '10px', letterSpacing: '0.8px' }}>24h Change</th>
                <th className="text-center px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.address} className="border-b border-ice-line/[0.06] last:border-0 hover:bg-ice-line/[0.03] transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <TokenLogo holding={holding} />
                      <div>
                        <div className="text-ice-text font-semibold" style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                          {holding.symbol}
                        </div>
                        <div className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                          {holding.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="text-ice-text font-mono" style={{ fontSize: '14px' }}>
                      {formatBalance(holding.balance)}
                    </div>
                    <div className="text-ice-faint font-mono" style={{ fontSize: '12px' }}>
                      ${holding.priceUsd < 0.01 ? holding.priceUsd.toFixed(6) : formatNumber(holding.priceUsd)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-ice-text font-mono" style={{ fontSize: '14px' }}>
                    ${formatNumber(holding.valueUsd)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span
                      className={cn('font-mono', holding.change24h >= 0 ? 'text-ice-up' : 'text-ice-down')}
                      style={{ fontSize: '14px' }}
                    >
                      {holding.change24h >= 0 ? '+' : ''}{holding.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => onTradeClick(holding)}
                      className="px-4 py-2 bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-all rounded-lg font-semibold"
                      style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}
                    >
                      Trade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============================================================
// TRANSACTIONS TAB CONTENT
// ============================================================

function TransactionsTab({
  transactions,
  loading,
  error,
  onRefetch,
}: {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}) {
  if (error) {
    return <ErrorState error={error} onRetry={onRefetch} />;
  }

  if (!loading && transactions.length === 0) {
    return <EmptyTransactionsState />;
  }

  const getTypeLabel = (type: TransactionType): string => {
    const labels: Record<TransactionType, string> = {
      swap: 'Swap',
      send: 'Send',
      receive: 'Receive',
      approve: 'Approve',
      stake: 'Stake',
      unstake: 'Unstake',
      contract: 'Contract',
    };
    return labels[type] || 'Unknown';
  };

  return (
    <div className="bg-ice-surface border border-ice-line/15 rounded-2xl p-2">
      {transactions.map((tx) => {
        const primaryTransfer = tx.transfers[0];
        const isOutgoing = primaryTransfer?.direction === 'out';

        return (
          <Link
            key={tx.hash}
            to={`/tx/${tx.hash}`}
            className={cn(
              'flex items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-ice-line/[0.04] transition-colors',
              tx.status === 'failed' && 'opacity-50',
            )}
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-full bg-ice-line/[0.06] flex items-center justify-center flex-shrink-0">
              {tx.protocol?.logoUrl ? (
                <img src={tx.protocol.logoUrl} alt={tx.protocol.name} className="w-6 h-6 rounded-full" />
              ) : (
                <TransactionIcon type={tx.type} />
              )}
            </div>

            {/* Info - Left side */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-ice-text font-medium" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
                  {getTypeLabel(tx.type)}
                </span>
                {tx.protocol && (
                  <span className="text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                    on {tx.protocol.name}
                  </span>
                )}
                {tx.status === 'failed' && (
                  <span className="text-ice-down text-xs font-medium px-1.5 py-0.5 bg-ice-down/10 rounded">Failed</span>
                )}
              </div>
              <div className="text-ice-faint font-mono" style={{ fontSize: '12px' }}>
                {formatRelativeTime(tx.timestamp)}
              </div>
            </div>

            {/* Amount - Right side */}
            {primaryTransfer && (
              <div className="text-right flex-shrink-0">
                <div
                  className={cn('font-mono font-medium', isOutgoing ? 'text-ice-down' : 'text-ice-up')}
                  style={{ fontSize: '14px' }}
                >
                  {isOutgoing ? '-' : '+'}{primaryTransfer.amount} {primaryTransfer.symbol}
                </div>
                {primaryTransfer.valueUsd > 0 && (
                  <div className="text-ice-faint font-mono" style={{ fontSize: '12px' }}>
                    {isOutgoing ? '-' : ''}${formatNumber(primaryTransfer.valueUsd)}
                  </div>
                )}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN PORTFOLIO VIEW
// ============================================================

export function PortfolioView() {
  const { authenticated, logout } = usePrivy();
  const { login } = useLogin();

  const handleLogin = async () => {
    if (authenticated) {
      await logout();
    }
    login();
  };
  const { address } = useAccount();
  const { holdings, totalValue, totalChange24h, loading: holdingsLoading, error: holdingsError, lastUpdated, txCount, activeSince, refetch: refetchHoldings } = usePortfolio();
  const { transactions, loading: txLoading, error: txError, refetch: refetchTx } = useTransactionHistory();

  const [activeTab, setActiveTab] = useState<'holdings' | 'transactions'>('holdings');
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleTradeClick = (holding: PortfolioHolding) => {
    setSelectedToken({ symbol: holding.symbol, address: holding.address });
    setSwapModalOpen(true);
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = () => {
    refetchHoldings();
    refetchTx();
  };

  // Not connected state
  if (!authenticated) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-12 flex items-center justify-center min-h-[65vh]">
        <div className="w-full max-w-md rounded-2xl bg-ice-surface border border-ice-line/15 p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-ice-accent/[0.08] border border-ice-line/15 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-ice-accent" />
          </div>
          <h2 className="text-ice-text text-xl font-bold mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
            Sign in to get started
          </h2>
          <p className="text-ice-muted mb-8 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px' }}>
            Track and manage your Avalanche assets across spot and options — all in one portfolio.
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
          <div className="mt-8 pt-6 border-t border-ice-line/15">
            <p className="text-ice-faint" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
              Sign in with email, Google, or your favorite wallet
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (holdingsLoading && holdings.length === 0) {
    return <LoadingState />;
  }

  const totalChangeValue = totalValue * (totalChange24h / 100);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 max-w-4xl">
      {/* Profile Header */}
      <div className="mb-6 md:mb-8 rounded-2xl bg-ice-surface border border-ice-line/15 p-5 md:p-6">
        {/* Identity Row */}
        <div className="flex items-center gap-3 md:gap-4 mb-5">
          {address && <WalletAvatar address={address} size={48} />}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-ice-text font-mono font-medium" style={{ fontSize: '15px' }}>
                {address ? truncateAddress(address) : ''}
              </span>
              <button
                onClick={handleCopyAddress}
                className="text-ice-muted hover:text-ice-text transition-colors p-1"
                title="Copy address"
              >
                {copied ? <Check className="w-4 h-4 text-ice-up" /> : <Copy className="w-4 h-4" />}
              </button>
              <a
                href={`https://snowtrace.io/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ice-muted hover:text-ice-text transition-colors p-1"
                title="View on Snowtrace"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-ice-line/[0.06] border border-ice-line/15 text-ice-muted" style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#E84142]"></span>
                Avalanche Mainnet
              </span>
            </div>
            {activeSince && (
              <div className="flex items-center gap-1.5 text-ice-muted">
                <Calendar className="w-3.5 h-3.5" />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                  Active since {formatDate(activeSince)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Value Row */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <div className="text-ice-faint font-mono uppercase mb-1.5" style={{ fontSize: '10px', letterSpacing: '1px' }}>
              Portfolio Value
            </div>
            <div className="text-ice-text font-mono" style={{ fontSize: '32px', fontWeight: 600, lineHeight: 1 }}>
              ${formatNumber(totalValue)}
            </div>
          </div>
          <div className={cn('flex items-center gap-1.5', totalChange24h >= 0 ? 'text-ice-up' : 'text-ice-down')}>
            {totalChange24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="font-mono" style={{ fontSize: '14px', fontWeight: 500 }}>
              {totalChange24h >= 0 ? '+' : ''}{totalChange24h.toFixed(2)}% ({totalChange24h >= 0 ? '+' : '-'}{formatCompactNumber(Math.abs(totalChangeValue))})
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {([
            ['holdings', `Holdings (${holdings.length})`],
            ['transactions', `Transactions (${txCount !== null ? txCount.toLocaleString() : transactions.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'px-4 py-2 rounded-[9px] transition-all font-medium whitespace-nowrap min-h-[44px] border',
                activeTab === id
                  ? 'bg-ice-accent/10 border-ice-line/40 text-ice-accent'
                  : 'bg-ice-surface border-ice-line/15 text-ice-muted hover:text-ice-text',
              )}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 text-ice-muted hover:text-ice-text transition-colors px-3 py-2 rounded-lg hover:bg-ice-line/[0.06] min-h-[44px] self-start sm:self-auto"
          disabled={holdingsLoading || txLoading}
        >
          <RefreshCw className={cn('w-4 h-4', (holdingsLoading || txLoading) && 'animate-spin')} />
          <span className="hidden sm:inline" style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Refresh'}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'holdings' ? (
        <HoldingsTab
          holdings={holdings}
          loading={holdingsLoading}
          error={holdingsError}
          onRefetch={refetchHoldings}
          onTradeClick={handleTradeClick}
        />
      ) : (
        <TransactionsTab
          transactions={transactions}
          loading={txLoading}
          error={txError}
          onRefetch={refetchTx}
        />
      )}

      {/* Swap Modal */}
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
