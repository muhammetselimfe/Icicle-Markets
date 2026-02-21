import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from './queryKeys';
import type { Transaction } from '../types/api';

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTransactions(limit: number = 10, autoRefresh: boolean = true): UseTransactionsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.transactions(43114, limit),
    queryFn: async () => {
      const response = await api.getTransactions(43114, limit);
      return response.data;
    },
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  return {
    transactions: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch transactions') : null,
    refetch: async () => { await refetch(); },
  };
}
