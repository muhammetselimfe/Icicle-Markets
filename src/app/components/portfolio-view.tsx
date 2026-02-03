import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import {
  Wallet,
  TrendingUp,
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

interface PortfolioViewProps {
  isWalletConnected: boolean;
  onConnectWallet: () => void;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (num === 0) return '0.00';
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

function WalletAvatar({ address, size = 80 }: { address: string; size?: number }) {
  // Generate colors from address
  const colors = useMemo(() => {
    const hash = address.toLowerCase();
    const c1 = `#${hash.slice(2, 8)}`;
    const c2 = `#${hash.slice(8, 14)}`;
    const c3 = `#${hash.slice(14, 20)}`;
    return [c1, c2, c3];
  }, [address]);

  // Generate pattern positions
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
      className="relative border-4 border-[#8be4ff] overflow-hidden"
      style={{
        width: size,
        height: size,
        background: '#0a0e27',
        boxShadow: '0 0 20px rgba(139, 228, 255, 0.3)',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        {pattern.map((p, i) => (
          <rect
            key={i}
            x={p.x}
            y={p.y}
            width={p.size}
            height={p.size}
            fill={p.color}
            opacity={0.8}
          />
        ))}
        {/* Ice overlay effect */}
        <rect x="0" y="0" width="100" height="100" fill="url(#ice-gradient)" />
        <defs>
          <linearGradient id="ice-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8be4ff" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#4db8ff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#8be4ff" stopOpacity="0.2" />
          </linearGradient>
        </defs>
      </svg>
      {/* Scanline effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
        }}
      />
    </div>
  );
}

// ============================================================
// TOKEN LOGO COMPONENT
// ============================================================

function TokenLogo({ holding }: { holding: PortfolioHolding }) {
  return (
    <div className="w-10 h-10 border-2 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center overflow-hidden">
      {holding.logoUrl ? (
        <img
          src={holding.logoUrl}
          alt={holding.symbol}
          className="w-7 h-7 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <span className={`text-lg text-[#8be4ff] ${holding.logoUrl ? 'hidden' : ''}`}>
        {holding.symbol.charAt(0)}
      </span>
    </div>
  );
}

// ============================================================
// TRANSACTION ICON COMPONENT
// ============================================================

function TransactionIcon({ type }: { type: TransactionType }) {
  const icons: Record<TransactionType, React.ReactNode> = {
    swap: <ArrowRightLeft className="w-4 h-4" />,
    send: <ArrowUpRight className="w-4 h-4" />,
    receive: <ArrowDownLeft className="w-4 h-4" />,
    approve: <ShieldCheck className="w-4 h-4" />,
    stake: <Layers className="w-4 h-4" />,
    unstake: <Layers className="w-4 h-4" />,
    contract: <FileCode className="w-4 h-4" />,
  };

  return icons[type] || <ArrowRightLeft className="w-4 h-4" />;
}

// ============================================================
// LOADING STATE
// ============================================================

function LoadingState() {
  return (
    <div className="container mx-auto px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="relative border-4 border-[#8be4ff] bg-[#0f1535] p-16 text-center">
          <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />
          <div className="relative z-10">
            <div className="w-24 h-24 mx-auto mb-8 border-4 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center relative">
              <div className="absolute inset-0 bg-[#8be4ff] opacity-20 blur-lg animate-pulse" />
              <RefreshCw className="w-12 h-12 text-[#8be4ff] relative z-10 animate-spin" />
            </div>
            <h2 className="text-3xl mb-6 text-[#8be4ff] animate-pulse" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              LOADING...
            </h2>
            <p className="text-[#4db8ff] text-xl" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
              FETCHING WALLET DATA
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ERROR STATE
// ============================================================

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="relative border-4 border-[#ff4d4d] bg-[#0f1535] p-12 text-center">
      <div className="absolute inset-0 bg-[#ff4d4d] opacity-5" />
      <div className="relative z-10">
        <AlertCircle className="w-12 h-12 text-[#ff4d4d] mx-auto mb-4" />
        <p className="text-[#ff4d4d] mb-4" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
          {error.toUpperCase()}
        </p>
        <button
          onClick={onRetry}
          className="px-6 py-3 border-2 border-[#ff4d4d] text-[#ff4d4d] hover:bg-[#ff4d4d]/10 transition-all"
          style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
        >
          RETRY
        </button>
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyHoldingsState() {
  return (
    <div className="relative border-3 border-[#4db8ff] bg-[#0f1535] p-12 text-center">
      <div className="absolute inset-0 bg-[#4db8ff] opacity-5" />
      <div className="relative z-10">
        <Wallet className="w-12 h-12 text-[#4db8ff] mx-auto mb-4" />
        <h3 className="text-xl text-[#4db8ff] mb-2" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
          NO TOKENS FOUND
        </h3>
        <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
          YOUR WALLET DOESN'T HOLD ANY TRACKED TOKENS
        </p>
      </div>
    </div>
  );
}

function EmptyTransactionsState() {
  return (
    <div className="relative border-3 border-[#4db8ff] bg-[#0f1535] p-12 text-center">
      <div className="absolute inset-0 bg-[#4db8ff] opacity-5" />
      <div className="relative z-10">
        <ArrowRightLeft className="w-12 h-12 text-[#4db8ff] mx-auto mb-4" />
        <h3 className="text-xl text-[#4db8ff] mb-2" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
          NO TRANSACTIONS
        </h3>
        <p className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
          NO RECENT TRANSACTIONS FOUND
        </p>
      </div>
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
    <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
      <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
      <div className="relative overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-[#4db8ff] bg-[#0a0e27]">
              <th className="text-left px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>ASSET</th>
              <th className="text-right px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>BALANCE</th>
              <th className="text-right px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>PRICE</th>
              <th className="text-right px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>VALUE</th>
              <th className="text-right px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>24H</th>
              <th className="text-right px-4 py-3 text-[#8be4ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>%</th>
              <th className="text-center px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => (
              <tr key={holding.address} className="border-b border-[#4db8ff]/30 hover:bg-[#8be4ff]/5 transition-colors">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <TokenLogo holding={holding} />
                    <div>
                      <div className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                        {holding.symbol}
                      </div>
                      <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                        {holding.name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-right text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                  {formatBalance(holding.balance)}
                </td>
                <td className="px-4 py-4 text-right text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                  ${holding.priceUsd < 0.01 ? holding.priceUsd.toFixed(6) : formatNumber(holding.priceUsd)}
                </td>
                <td className="px-4 py-4 text-right text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                  ${formatNumber(holding.valueUsd)}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className={holding.change24h >= 0 ? 'text-[#4dff88]' : 'text-[#ff4d4d]'} style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                    {holding.change24h >= 0 ? '+' : ''}{holding.change24h.toFixed(2)}%
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 border border-[#4db8ff] bg-[#0a0e27] overflow-hidden">
                      <div className="h-full bg-[#8be4ff]" style={{ width: `${holding.allocation}%` }} />
                    </div>
                    <span className="text-[#8be4ff] w-12 text-right" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                      {holding.allocation.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <button
                    onClick={() => onTradeClick(holding)}
                    className="px-3 py-1.5 border-2 border-[#4dff88] bg-transparent text-[#4dff88] hover:bg-[#4dff88]/10 transition-all uppercase"
                    style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
                  >
                    TRADE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
      <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
      <div className="relative">
        {transactions.map((tx, index) => (
          <Link
            key={tx.hash}
            to={`/tx/${tx.hash}`}
            className={cn(
              "block px-4 py-4 hover:bg-[#8be4ff]/10 transition-colors cursor-pointer",
              index < transactions.length - 1 && "border-b border-[#4db8ff]/30",
              tx.status === 'failed' && "opacity-60"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: Time, Hash, Status */}
              <div className="flex-shrink-0 w-36">
                <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                  {formatRelativeTime(tx.timestamp)}
                </div>
                <div
                  className="flex items-center gap-1 text-[#4db8ff]/60"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}
                >
                  {truncateAddress(tx.hash)}
                </div>
                {tx.status === 'failed' && (
                  <span className="text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                    FAILED
                  </span>
                )}
              </div>

              {/* Middle: Protocol & Action */}
              <div className="flex items-center gap-3 flex-shrink-0 w-48">
                {tx.protocol ? (
                  <div className="w-10 h-10 border-2 border-[#4db8ff] bg-[#0a0e27] flex items-center justify-center overflow-hidden">
                    {tx.protocol.logoUrl ? (
                      <img src={tx.protocol.logoUrl} alt={tx.protocol.name} className="w-7 h-7 object-contain" />
                    ) : (
                      <TransactionIcon type={tx.type} />
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 border-2 border-[#4db8ff] bg-[#0a0e27] flex items-center justify-center text-[#4db8ff]">
                    <TransactionIcon type={tx.type} />
                  </div>
                )}
                <div>
                  <div className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    {getTypeLabel(tx.type)}
                  </div>
                  {tx.protocol && (
                    <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                      {tx.protocol.name}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Token Transfers */}
              <div className="flex-1 flex flex-col gap-1">
                {tx.transfers.map((transfer, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {transfer.logoUrl && (
                      <img src={transfer.logoUrl} alt={transfer.symbol} className="w-5 h-5 object-contain" />
                    )}
                    <span
                      className={transfer.direction === 'out' ? 'text-[#ff4d4d]' : 'text-[#4dff88]'}
                      style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
                    >
                      {transfer.direction === 'out' ? '-' : '+'}
                      {transfer.amount} {transfer.symbol}
                    </span>
                    {transfer.valueUsd > 0 && (
                      <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                        (${formatNumber(transfer.valueUsd)})
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Far Right: Gas Fee */}
              <div className="flex-shrink-0 text-right w-32">
                <div className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  Gas Fee
                </div>
                <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                  {tx.gasFee.amount} AVAX
                </div>
                <div className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
                  (${formatNumber(tx.gasFee.valueUsd)})
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PORTFOLIO VIEW
// ============================================================

export function PortfolioView({ isWalletConnected, onConnectWallet }: PortfolioViewProps) {
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
  if (!isWalletConnected) {
    return (
      <div className="container mx-auto px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="relative border-4 border-[#8be4ff] bg-[#0f1535] p-16 text-center">
            <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />
            <div className="relative z-10">
              <div className="w-24 h-24 mx-auto mb-8 border-4 border-[#8be4ff] bg-[#0a0e27] flex items-center justify-center relative">
                <div className="absolute inset-0 bg-[#8be4ff] opacity-20 blur-lg" />
                <Wallet className="w-12 h-12 text-[#8be4ff] relative z-10" />
              </div>
              <h2 className="text-4xl mb-6 text-[#8be4ff]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
                CONNECT WALLET
              </h2>
              <p className="text-[#4db8ff] mb-12 text-xl leading-relaxed max-w-xl mx-auto" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
                TRACK AND MANAGE YOUR AVALANCHE ASSETS.<br />
                CONNECT YOUR WALLET TO VIEW PORTFOLIO,<br />
                TRACK PERFORMANCE, AND EXECUTE TRADES.
              </p>
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-[#8be4ff] opacity-30 blur-xl" />
                <button
                  onClick={onConnectWallet}
                  className="relative border-4 border-[#8be4ff] bg-[#0f1535] px-12 py-6 hover:bg-[#8be4ff] hover:text-[#0a0e27] transition-all shadow-[0_0_30px_rgba(139,228,255,0.6)]"
                >
                  <div className="flex items-center gap-4">
                    <Wallet className="w-6 h-6" />
                    <span style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '14px' }}>
                      CONNECT WALLET
                    </span>
                  </div>
                </button>
              </div>
              <div className="mt-12 pt-8 border-t-2 border-[#4db8ff]/30">
                <p className="text-[#4db8ff] uppercase" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                  SUPPORTED: METAMASK | CORE | COINBASE | WALLETCONNECT
                </p>
              </div>
            </div>
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
    <div className="container mx-auto px-6 py-8">
      {/* Profile Header */}
      <div className="relative border-4 border-[#8be4ff] bg-[#0f1535] p-6 mb-6">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-transparent via-[#8be4ff] to-transparent" />

        <div className="relative z-10 flex items-center justify-between">
          {/* Left: Avatar + Address */}
          <div className="flex items-center gap-6">
            {address && <WalletAvatar address={address} size={80} />}

            <div>
              {/* Address */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[#8be4ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '24px' }}>
                  {address ? truncateAddress(address) : ''}
                </span>
                <button
                  onClick={handleCopyAddress}
                  className="text-[#4db8ff] hover:text-[#8be4ff] transition-colors"
                  title="Copy address"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <a
                  href={`https://snowtrace.io/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4db8ff] hover:text-[#8be4ff] transition-colors"
                  title="View on Snowtrace"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Active Since */}
              {activeSince && (
                <div className="flex items-center gap-2 text-[#4db8ff]">
                  <Calendar className="w-4 h-4" />
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
                    Active since {formatDate(activeSince)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Portfolio Value */}
          <div className="text-right">
            <div className="text-[#4db8ff] mb-1" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
              PORTFOLIO VALUE
            </div>
            <div className="text-[#8be4ff] mb-1" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '24px' }}>
              ${formatNumber(totalValue)}
            </div>
            <div className={`flex items-center justify-end gap-2 ${totalChange24h >= 0 ? 'text-[#4dff88]' : 'text-[#ff4d4d]'}`}>
              <TrendingUp className="w-4 h-4" />
              <span style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}>
                {totalChange24h >= 0 ? '+' : ''}{totalChange24h.toFixed(2)}% ({totalChange24h >= 0 ? '+' : '-'}${formatNumber(Math.abs(totalChangeValue))})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b-2 border-[#4db8ff]/30 mb-6">
        <div className="flex">
          <button
            onClick={() => setActiveTab('holdings')}
            className={cn(
              "px-6 py-3 transition-all border-b-2 -mb-[2px] uppercase",
              activeTab === 'holdings'
                ? "text-[#8be4ff] border-[#8be4ff]"
                : "text-[#4db8ff]/60 border-transparent hover:text-[#8be4ff] hover:border-[#8be4ff]/30"
            )}
            style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
          >
            Holdings ({holdings.length})
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={cn(
              "px-6 py-3 transition-all border-b-2 -mb-[2px] uppercase",
              activeTab === 'transactions'
                ? "text-[#8be4ff] border-[#8be4ff]"
                : "text-[#4db8ff]/60 border-transparent hover:text-[#8be4ff] hover:border-[#8be4ff]/30"
            )}
            style={{ fontFamily: "'VT323', monospace", fontSize: '20px' }}
          >
            Transactions ({txCount !== null ? txCount.toLocaleString() : transactions.length})
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 text-[#4db8ff] hover:text-[#8be4ff] transition-colors px-4 py-2"
          disabled={holdingsLoading || txLoading}
        >
          <RefreshCw className={cn("w-4 h-4", (holdingsLoading || txLoading) && "animate-spin")} />
          <span style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'REFRESH'}
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
