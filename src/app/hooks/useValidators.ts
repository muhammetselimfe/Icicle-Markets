import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { Validator } from '../types/api';

interface UseValidatorsResult {
  validators: Validator[];
  totalCount: number;
  activeCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// C-Chain / Primary Network subnet ID
const PRIMARY_NETWORK_SUBNET_ID = '11111111111111111111111111111111LpoYY';

export function useValidators(activeOnly: boolean = true, subnetId: string = PRIMARY_NETWORK_SUBNET_ID): UseValidatorsResult {
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchValidators = useCallback(async () => {
    try {
      setError(null);
      const allValidators: Validator[] = [];
      let offset = 0;
      const limit = 100; // Max per request

      // Paginate through all validators
      while (true) {
        const response = await api.getValidators(activeOnly, subnetId, limit, offset);
        const batch = response.data;

        if (!batch || batch.length === 0) break;

        allValidators.push(...batch);

        // If we got less than limit, we've reached the end
        if (batch.length < limit) break;

        offset += limit;
      }

      setValidators(allValidators);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch validators');
    } finally {
      setLoading(false);
    }
  }, [activeOnly, subnetId]);

  useEffect(() => {
    fetchValidators();

    // Refresh every 5 minutes (validators don't change often)
    const interval = setInterval(fetchValidators, 300000);
    return () => clearInterval(interval);
  }, [fetchValidators]);

  const activeCount = validators.filter((v) => v.active).length;

  return {
    validators,
    totalCount: validators.length,
    activeCount,
    loading,
    error,
    refetch: fetchValidators,
  };
}
