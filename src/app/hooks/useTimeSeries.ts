import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
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
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeSeries = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getTimeSeries(metric, 43114, granularity, limit);
      setData(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch time series data');
    } finally {
      setLoading(false);
    }
  }, [metric, granularity, limit]);

  useEffect(() => {
    fetchTimeSeries();

    if (autoRefresh) {
      const interval = setInterval(fetchTimeSeries, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [fetchTimeSeries, autoRefresh]);

  return { data, loading, error, refetch: fetchTimeSeries };
}
