import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from './queryKeys';
import type { TimeSeriesDataPoint, Granularity, MetricName } from '../types/api';

interface UseTimeSeriesResult {
  data: TimeSeriesDataPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTimeSeries(
  metric: MetricName,
  granularity: Granularity = 'hour',
  limit: number = 24,
  autoRefresh: boolean = false
): UseTimeSeriesResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.timeSeries(metric, granularity, limit),
    queryFn: async () => {
      const response = await api.getTimeSeries(metric, 43114, granularity, limit);
      return response.data.data;
    },
    refetchInterval: autoRefresh ? 60_000 : false,
    staleTime: 60_000,
  });

  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch time series data') : null,
    refetch: async () => { await refetch(); },
  };
}
