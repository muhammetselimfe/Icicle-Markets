import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from './queryKeys';
import type { ChainStats } from '../types/api';

interface UseChainStatsResult {
  stats: ChainStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChainStats(autoRefresh: boolean = true): UseChainStatsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.chainStats(43114),
    queryFn: async () => {
      const response = await api.getChainStats(43114);
      return response.data;
    },
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  return {
    stats: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch chain stats') : null,
    refetch: async () => { await refetch(); },
  };
}
