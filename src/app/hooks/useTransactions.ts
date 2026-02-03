import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Transaction } from '../types/api';

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTransactions(limit: number = 10, autoRefresh: boolean = true): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getTransactions(43114, limit);
      setTransactions(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchTransactions();

    if (autoRefresh) {
      const interval = setInterval(fetchTransactions, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [fetchTransactions, autoRefresh]);

  return { transactions, loading, error, refetch: fetchTransactions };
}
