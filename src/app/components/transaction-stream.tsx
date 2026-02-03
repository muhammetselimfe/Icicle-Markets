import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, ArrowRight, XCircle } from 'lucide-react';
import { formatAddress, formatWei } from '@/app/utils/formatters';
import { getRelativeTime } from '@/app/utils/time';
import { api } from '@/app/services/api';
import type { Transaction } from '@/app/types/api';

interface TransactionStreamProps {
  initialTransactions?: Transaction[];
  loading?: boolean;
  error?: string | null;
}

// Animated transaction card component
function TransactionCard({
  tx,
  index,
  isNew,
  isExiting,
  totalTxs,
  newTxIndex,
}: {
  tx: Transaction;
  index: number;
  isNew: boolean;
  isExiting: boolean;
  totalTxs: number;
  newTxIndex: number;
}) {
  // Calculate opacity based on position (fade out towards bottom)
  const fadeStart = Math.max(0, totalTxs - 3);
  const opacity = index >= fadeStart ? 1 - ((index - fadeStart + 1) / 4) * 0.7 : 1;

  // Stagger delay for new transactions
  const animationDelay = isNew ? `${newTxIndex * 0.2}s` : '0s';

  return (
    <Link
      to={`/tx/${tx.hash}`}
      className={`
        tx-item relative overflow-hidden cursor-pointer block
        ${isNew ? 'tx-item-enter' : ''}
        ${isExiting ? 'tx-item-exit' : ''}
      `}
      style={{
        opacity: isExiting ? 0 : opacity,
        animationDelay: animationDelay,
      }}
    >
      {/* Main card */}
      <div className={`
        relative border-2 bg-[#0a0e27] p-3 transition-all duration-300
        ${isNew
          ? 'border-[#4dff88] tx-glow-pulse'
          : 'border-[#4db8ff]/50 hover:border-[#8be4ff] hover:shadow-[0_0_15px_rgba(139,228,255,0.3)]'
        }
      `}>
        {/* New tx glow effect */}
        {isNew && (
          <div className="absolute inset-0 bg-gradient-to-r from-[#4dff88]/20 via-transparent to-transparent" />
        )}

        <div className="relative z-10 flex items-center gap-3">
          {/* Status icon */}
          <div className={`
            relative w-10 h-10 border-2 flex items-center justify-center transition-all duration-300
            ${isNew
              ? 'border-[#4dff88] bg-[#4dff88]/10'
              : tx.success
                ? 'border-[#8be4ff] bg-[#0f1535]'
                : 'border-[#ff4d4d] bg-[#ff4d4d]/10'
            }
          `}>
            {tx.success ? (
              <Activity className={`w-5 h-5 ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`} />
            ) : (
              <XCircle className="w-5 h-5 text-[#ff4d4d]" />
            )}
          </div>

          {/* Transaction info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-bold ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`}
                style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
              >
                {formatAddress(tx.hash, 10, 6)}
              </span>
              {isNew && (
                <span
                  className="px-1.5 py-0.5 bg-[#4dff88]/20 border border-[#4dff88] text-[#4dff88] uppercase"
                  style={{ fontFamily: "'VT323', monospace", fontSize: '12px' }}
                >
                  NEW
                </span>
              )}
              <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>•</span>
              <span className="flex items-center gap-1 text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                {formatAddress(tx.from, 6, 4)}
                <ArrowRight className="w-3 h-3" />
                {tx.to ? formatAddress(tx.to, 6, 4) : 'CREATE'}
              </span>
              <span className="text-[#4db8ff]/60" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>•</span>
              <span className="text-white" style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}>
                {formatWei(tx.value)}
              </span>
            </div>
          </div>

          {/* Time */}
          <div
            className={`flex items-center gap-1 ${isNew ? 'text-[#4dff88]' : 'text-[#8be4ff]'}`}
            style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
          >
            <Clock className="w-3 h-3" />
            {getRelativeTime(tx.block_time)}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Loading skeleton
function TransactionSkeleton({ index }: { index: number }) {
  return (
    <div
      className="relative border-2 border-[#4db8ff]/30 bg-[#0a0e27] p-3 animate-pulse"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border-2 border-[#4db8ff]/30 bg-[#0f1535]" />
        <div className="flex-1 flex items-center gap-3">
          <div className="h-4 w-32 bg-[#4db8ff]/20" />
          <div className="h-3 w-40 bg-[#4db8ff]/10" />
          <div className="h-3 w-20 bg-[#4db8ff]/10" />
        </div>
        <div className="h-4 w-16 bg-[#4db8ff]/20" />
      </div>
    </div>
  );
}

export function TransactionStream({ initialTransactions = [], loading: initialLoading = false, error: initialError = null }: TransactionStreamProps) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(initialError);
  const [connected, setConnected] = useState(false);
  const [newTxHashes, setNewTxHashes] = useState<Set<string>>(new Set());
  const [exitingTxs, setExitingTxs] = useState<Set<string>>(new Set());
  const [tps, setTps] = useState(0);
  const prevTxsRef = useRef<Transaction[]>([]);
  const txTimestamps = useRef<number[]>([]);

  // Fetch transactions with faster polling for live feel
  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getTransactions(43114, 10);
      setTransactions(response.data);
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchTransactions();

    // Poll every 3 seconds for live feel
    const interval = setInterval(fetchTransactions, 3000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  // Track new transactions and calculate TPS
  useEffect(() => {
    if (transactions.length > 0) {
      const prevHashes = new Set(prevTxsRef.current.map(t => t.hash));
      const newHashes = new Set<string>();

      transactions.forEach(tx => {
        if (!prevHashes.has(tx.hash)) {
          newHashes.add(tx.hash);
          txTimestamps.current.push(Date.now());
        }
      });

      // Calculate TPS (last 10 seconds)
      const now = Date.now();
      txTimestamps.current = txTimestamps.current.filter(t => now - t < 10000);
      setTps(txTimestamps.current.length / 10);

      if (newHashes.size > 0) {
        setNewTxHashes(newHashes);

        // Mark old txs as exiting
        const currentHashes = new Set(transactions.map(t => t.hash));
        const exiting = new Set<string>();
        prevTxsRef.current.forEach(tx => {
          if (!currentHashes.has(tx.hash)) {
            exiting.add(tx.hash);
          }
        });
        setExitingTxs(exiting);

        // Clear "new" status after animation
        const timer = setTimeout(() => {
          setNewTxHashes(new Set());
          setExitingTxs(new Set());
        }, 2000);

        prevTxsRef.current = transactions;
        return () => clearTimeout(timer);
      }

      prevTxsRef.current = transactions;
    }
  }, [transactions]);

  // Error state when no transactions
  if (error && transactions.length === 0) {
    return (
      <div className="relative border-3 border-[#ff4d4d] bg-[#0f1535] p-6">
        <div className="flex items-center gap-2 text-[#ff4d4d]" style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}>
          <Activity className="w-5 h-5" />
          Error loading transactions: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Inject animations */}
      <style>{`
        @keyframes txSlideInFromTop {
          0% {
            opacity: 0;
            transform: translateY(-60px);
            max-height: 0;
            margin-bottom: 0;
            padding: 0;
          }
          30% {
            max-height: 100px;
            margin-bottom: 8px;
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            max-height: 100px;
            margin-bottom: 8px;
          }
        }

        @keyframes txFadeOut {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(20px);
          }
        }

        @keyframes txGlowPulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(77, 255, 136, 0.4);
          }
          50% {
            box-shadow: 0 0 40px rgba(77, 255, 136, 0.6);
          }
        }

        .tx-item {
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tx-item-enter {
          animation: txSlideInFromTop 0.4s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        .tx-item-exit {
          animation: txFadeOut 0.3s ease-out forwards;
        }

        .tx-glow-pulse {
          animation: txGlowPulse 1s ease-in-out infinite;
        }
      `}</style>

      {/* Header with live indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3
            className="text-[#8be4ff] uppercase"
            style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '12px' }}
          >
            LIVE TRANSACTIONS
          </h3>
          <div className={`flex items-center gap-2 px-3 py-1 border-2 ${
            connected
              ? 'border-[#4dff88] bg-[#4dff88]/10'
              : 'border-[#ffeb3b] bg-[#ffeb3b]/10'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              connected ? 'bg-[#4dff88]' : 'bg-[#ffeb3b]'
            }`} />
            <span
              className={`uppercase ${connected ? 'text-[#4dff88]' : 'text-[#ffeb3b]'}`}
              style={{ fontFamily: "'VT323', monospace", fontSize: '16px' }}
            >
              {connected ? 'LIVE' : 'CONNECTING...'}
            </span>
          </div>
        </div>

        {/* TPS indicator */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 border-2 border-[#8be4ff] bg-[#0a0e27]">
            <span
              className="text-[#8be4ff]"
              style={{ fontFamily: "'VT323', monospace", fontSize: '18px' }}
            >
              ~{tps.toFixed(1)} TXS/SEC
            </span>
          </div>
          <div className="text-[#4db8ff]" style={{ fontFamily: "'VT323', monospace", fontSize: '14px' }}>
            REAL-TIME FEED
          </div>
        </div>
      </div>

      {/* Transaction stream container */}
      <div className="relative border-3 border-[#8be4ff] bg-[#0f1535] overflow-hidden">
        <div className="absolute inset-0 bg-[#8be4ff] opacity-5" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4dff88] via-[#8be4ff] to-[#4dff88]" />

        {/* Animated background grid */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, #8be4ff 1px, transparent 1px),
                linear-gradient(to bottom, #8be4ff 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 p-4 space-y-2 max-h-[520px] overflow-hidden">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TransactionSkeleton key={i} index={i} />
            ))
          ) : (
            transactions.map((tx, index) => {
              const isNew = newTxHashes.has(tx.hash);
              // Calculate position among new txs for staggered animation
              const newTxIndex = isNew
                ? Array.from(newTxHashes).indexOf(tx.hash)
                : 0;
              return (
                <TransactionCard
                  key={tx.hash}
                  tx={tx}
                  index={index}
                  isNew={isNew}
                  isExiting={exitingTxs.has(tx.hash)}
                  totalTxs={transactions.length}
                  newTxIndex={newTxIndex}
                />
              );
            })
          )}
        </div>

        {/* Fade out gradient at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0f1535] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
