import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { queryKeys } from './queryKeys';
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.validators(activeOnly, subnetId),
    queryFn: async () => {
      const allValidators: Validator[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const response = await api.getValidators(activeOnly, subnetId, limit, offset);
        const batch = response.data;

        if (!batch || batch.length === 0) break;
        allValidators.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }

      return allValidators;
    },
    refetchInterval: 300_000,
    staleTime: 300_000,
  });

  const validators = data ?? [];
  const activeCount = validators.filter((v) => v.active).length;

  return {
    validators,
    totalCount: validators.length,
    activeCount,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch validators') : null,
    refetch: async () => { await refetch(); },
  };
}
