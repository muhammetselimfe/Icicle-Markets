import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { ChainStats } from '../types/api';

interface UseChainStatsResult {
  stats: ChainStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChainStats(autoRefresh: boolean = true): UseChainStatsResult {
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getChainStats(43114);
      setStats(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch chain stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [fetchStats, autoRefresh]);

  return { stats, loading, error, refetch: fetchStats };
}
