import { useQuery } from '@tanstack/react-query';

const REDSTONE_API = 'https://api.redstone.finance';
const DATA_SERVICE_ID = 'redstone';

interface RedstonePriceResponse {
  symbol: string;
  value: number;
  timestamp: number;
}

async function fetchRedstonePrice(feedId: string): Promise<{ price: number; timestamp: number }> {
  const url = `${REDSTONE_API}/prices?symbol=${feedId}&provider=${DATA_SERVICE_ID}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data: RedstonePriceResponse[] = await res.json();
  if (!data.length) throw new Error(`No price data for ${feedId}`);

  return { price: data[0].value, timestamp: data[0].timestamp / 1000 };
}

interface UseRedstonePriceResult {
  price: number;
  timestamp: number;
  loading: boolean;
  error: string | null;
}

export function useRedstonePrice(feedId: string = 'AVAX'): UseRedstonePriceResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['redstonePrice', feedId],
    queryFn: () => fetchRedstonePrice(feedId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return {
    price: data?.price ?? 0,
    timestamp: data?.timestamp ?? 0,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch Redstone price') : null,
  };
}
