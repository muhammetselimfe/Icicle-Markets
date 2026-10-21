import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, ArrowRight, XCircle } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
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
  const fadeStart = Math.max(0, totalTxs - 3);
  const opacity = index >= fadeStart ? 1 - ((index - fadeStart + 1) / 4) * 0.7 : 1;
  const animationDelay = isNew ? `${newTxIndex * 0.2}s` : '0s';

  return (
    <Link
      to={`/tx/${tx.hash}`}
      className={cn(
        "tx-item relative overflow-hidden cursor-pointer block",
        isNew && "tx-item-enter",
        isExiting && "tx-item-exit"
      )}
      style={{
        opacity: isExiting ? 0 : opacity,
        animationDelay: animationDelay,
      }}
    >
      <div className={cn(
        "relative bg-ice-surface2 p-3 rounded-lg transition-all duration-300",
        isNew ? "ring-1 ring-green-500/30" : "hover:bg-ice-line/[0.08]"
      )}>
        {isNew && (
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-transparent to-transparent rounded-lg" />
        )}

        <div className="relative z-10 flex items-center gap-3">
          <div className={cn(
            "relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-300",
            isNew
              ? "bg-green-500/10"
              : tx.success
                ? "bg-ice-line/[0.08]"
                : "bg-red-500/10"
          )}>
            {tx.success ? (
              <Activity className={cn("w-5 h-5", isNew ? "text-green-500" : "text-ice-muted")} />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn("font-medium", isNew ? "text-green-500" : "text-ice-text", 'text-[14px]')}
              >
                {formatAddress(tx.hash, 10, 6)}
              </span>
              {isNew && (
                <span
                  className="px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded text-xs font-medium"
                >
                  NEW
                </span>
              )}
              <span className="text-ice-faint">•</span>
              <span className="flex items-center gap-1 text-ice-muted text-[13px]">
                {formatAddress(tx.from, 6, 4)}
                <ArrowRight className="w-3 h-3" />
                {tx.to ? formatAddress(tx.to, 6, 4) : 'CREATE'}
              </span>
              <span className="text-ice-faint">•</span>
              <span className="text-ice-muted text-[13px]">
                {formatWei(tx.value)}
              </span>
            </div>
          </div>

          <div
            className={cn("flex items-center gap-1", isNew ? "text-green-500" : "text-ice-faint", 'text-[13px]')}
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
      className="relative bg-ice-surface2 p-3 rounded-lg animate-pulse"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-ice-line/[0.08] rounded-lg" />
        <div className="flex-1 flex items-center gap-3">
          <div className="h-4 w-32 bg-ice-line/[0.08] rounded" />
          <div className="h-3 w-40 bg-ice-surface2 rounded" />
          <div className="h-3 w-20 bg-ice-surface2 rounded" />
        </div>
        <div className="h-4 w-16 bg-ice-line/[0.08] rounded" />
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

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 3000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

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

      const now = Date.now();
      txTimestamps.current = txTimestamps.current.filter(t => now - t < 10000);
      setTps(txTimestamps.current.length / 10);

      if (newHashes.size > 0) {
        setNewTxHashes(newHashes);

        const currentHashes = new Set(transactions.map(t => t.hash));
        const exiting = new Set<string>();
        prevTxsRef.current.forEach(tx => {
          if (!currentHashes.has(tx.hash)) {
            exiting.add(tx.hash);
          }
        });
        setExitingTxs(exiting);

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

  if (error && transactions.length === 0) {
    return (
      <div className="bg-red-500/10 p-5 rounded-xl">
        <div className="flex items-center gap-2 text-red-500 text-[14px]">
          <Activity className="w-4 h-4" />
          Error loading transactions: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <style>{`
        @keyframes txSlideInFromTop {
          0% {
            opacity: 0;
            transform: translateY(-60px);
            max-height: 0;
            margin-bottom: 0;
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
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(20px); }
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
      `}</style>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-ice-text font-medium text-[14px]">
            Live Transactions
          </h3>
          <div className={cn(
            "flex items-center gap-2 px-2.5 py-1 rounded-lg",
            connected ? "bg-green-500/10" : "bg-yellow-500/10"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full animate-pulse",
              connected ? "bg-green-500" : "bg-yellow-500"
            )} />
            <span
              className={cn(connected ? "text-green-500" : "text-yellow-500", 'text-[12px]')}
            >
              {connected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-ice-surface2 rounded-lg">
            <span className="text-ice-muted text-[13px]">
              ~{tps.toFixed(1)} txs/sec
            </span>
          </div>
          <div className="text-ice-faint text-[12px]">
            Real-time feed
          </div>
        </div>
      </div>

      <div className="relative bg-ice-surface overflow-hidden rounded-xl">
        <div className="relative z-10 p-4 space-y-2 max-h-[520px] overflow-hidden">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TransactionSkeleton key={i} index={i} />
            ))
          ) : (
            transactions.map((tx, index) => {
              const isNew = newTxHashes.has(tx.hash);
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

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-ice-bg to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
