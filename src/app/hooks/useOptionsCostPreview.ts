import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI } from '@/app/config/options-abis';
import { queryKeys } from './queryKeys';

interface UseOptionsCostPreviewOptions {
  marketId: number;
  lowerTick: bigint | null;
  upperTick: bigint | null;
  quantity: string;
  debounceMs?: number;
}

export function useOptionsCostPreview({
  marketId,
  lowerTick,
  upperTick,
  quantity,
  debounceMs = 500,
}: UseOptionsCostPreviewOptions) {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });
  const [debouncedQty, setDebouncedQty] = useState(quantity);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQty(quantity), debounceMs);
    return () => clearTimeout(timer);
  }, [quantity, debounceMs]);

  const parsedQty = (() => {
    try {
      const num = parseFloat(debouncedQty);
      if (isNaN(num) || num <= 0) return null;
      // Quantity is in USDC 6-decimal units
      return BigInt(Math.round(num * 1e6));
    } catch {
      return null;
    }
  })();

  const enabled =
    !!publicClient &&
    marketId > 0 &&
    lowerTick !== null &&
    upperTick !== null &&
    lowerTick < upperTick &&
    !!parsedQty;

  const { data, isFetching, error } = useQuery({
    queryKey: queryKeys.optionsOpenCost(
      marketId,
      lowerTick?.toString() ?? '',
      upperTick?.toString() ?? '',
      debouncedQty,
    ),
    queryFn: async () => {
      if (!publicClient || !parsedQty || lowerTick === null || upperTick === null) {
        throw new Error('Invalid params');
      }
      const cost = await publicClient.readContract({
        address: OPTIONS_CONTRACTS.core,
        abi: CORE_ABI,
        functionName: 'calculateOpenCost',
        args: [BigInt(marketId), lowerTick, upperTick, parsedQty],
      });
      return cost as bigint;
    },
    enabled,
    staleTime: 10_000,
    gcTime: 30_000,
    retry: 1,
  });

  return {
    cost: enabled ? (data ?? null) : null,
    loading: isFetching,
    error: error ? (error instanceof Error ? error.message : 'Failed to calculate cost') : null,
  };
}
