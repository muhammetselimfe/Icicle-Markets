import { useQuery } from '@tanstack/react-query';
import { fetchRedstoneLatestPrice } from '@/app/services/redstone';

interface UseRedstonePriceResult {
  price: number;
  /** Unix timestamp in seconds */
  timestamp: number;
  loading: boolean;
  error: string | null;
}

/**
 * Live price from the RedStone `redstone-primary-prod` feed, the same data
 * service the options contracts settle against.
 */
export function useRedstonePrice(feedId: string = 'AVAX'): UseRedstonePriceResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['redstonePrice', feedId],
    queryFn: () => fetchRedstoneLatestPrice(feedId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return {
    price: data?.price ?? 0,
    timestamp: data ? data.timestamp / 1000 : 0,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch Redstone price') : null,
  };
}
