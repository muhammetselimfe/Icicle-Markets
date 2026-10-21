import { useState, useEffect, useRef, useCallback } from 'react';
import { XCircle, AlertTriangle } from 'lucide-react';
import { formatAddress, formatWei } from '@/app/utils/formatters';
import { intentToType, nameFor } from '@/app/utils/transaction-history';
import { TransactionTypeIcon } from '@/app/components/shell/transaction-type';
import { transactionTitle } from '@/app/pages/block-page';
import { getRelativeTime } from '@/app/utils/time';
import { api } from '@/app/services/api';
import type { Transaction } from '@/app/types/api';
import { LiveListCard, LiveRow, LiveRowSkeleton } from './live-list';

const POLL_MS = 3000;

export function TransactionStream() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [newHashes, setNewHashes] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [tps, setTps] = useState(0);
  const prevRef = useRef<Transaction[]>([]);
  const arrivals = useRef<number[]>([]);

  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getTransactions(43114, 10);
      // One row per hash: the list endpoint can repeat a transaction across pages.
      const seen = new Set<string>();
      setTransactions(response.data.filter((t) => (seen.has(t.hash) ? false : (seen.add(t.hash), true))));
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
    const interval = setInterval(fetchTransactions, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  useEffect(() => {
    if (transactions.length === 0) return;
    const prevHashes = new Set(prevRef.current.map((t) => t.hash));
    const fresh = new Set<string>();
    for (const tx of transactions) {
      if (!prevHashes.has(tx.hash)) {
        fresh.add(tx.hash);
        arrivals.current.push(Date.now());
      }
    }
    const now = Date.now();
    arrivals.current = arrivals.current.filter((t) => now - t < 10_000);
    setTps(arrivals.current.length / 10);

    if (fresh.size > 0) {
      setNewHashes(fresh);
      const current = new Set(transactions.map((t) => t.hash));
      setExiting(new Set(prevRef.current.filter((t) => !current.has(t.hash)).map((t) => t.hash)));
      const timer = setTimeout(() => {
        setNewHashes(new Set());
        setExiting(new Set());
      }, 1500);
      prevRef.current = transactions;
      return () => clearTimeout(timer);
    }
    prevRef.current = transactions;
  }, [transactions]);

  const notice =
    error && transactions.length === 0 ? (
      <div className="flex items-center gap-2 px-5 py-3 text-ice-down text-[13px] border-b border-ice-line/10">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Could not load transactions: {error}
      </div>
    ) : null;

  const newest = Array.from(newHashes);

  return (
    <LiveListCard title="Transactions" connected={connected} rate={tps > 0 ? `${tps.toFixed(1)} txs/s` : undefined} notice={notice}>
      {loading ? (
        <LiveRowSkeleton />
      ) : (
        transactions.map((tx) => {
          const isNew = newHashes.has(tx.hash);
          return (
            <LiveRow
              key={tx.hash}
              to={`/tx/${tx.hash}`}
              icon={tx.success ? <TransactionTypeIcon type={intentToType(tx.intent?.kind)} className="w-[18px] h-[18px]" /> : <XCircle className="w-[18px] h-[18px]" />}
              tone={tx.success ? 'default' : 'danger'}
              title={tx.intent || tx.method ? transactionTitle(tx) : formatAddress(tx.hash, 10, 6)}
              subtitle={`${nameFor(tx, tx.from) ?? formatAddress(tx.from, 6, 4)} → ${tx.to ? nameFor(tx, tx.to) ?? formatAddress(tx.to, 6, 4) : 'contract creation'} · ${formatWei(tx.value)}`}
              trailing={getRelativeTime(tx.block_time)}
              isNew={isNew}
              isExiting={exiting.has(tx.hash)}
              delayMs={isNew ? newest.indexOf(tx.hash) * 80 : 0}
            />
          );
        })
      )}
    </LiveListCard>
  );
}
