import { useQuery } from '@tanstack/react-query';
import { coingecko } from '@/app/services/coingecko';
import { queryKeys } from './queryKeys';

export interface ChartPoint {
  time: number;
  price: number;
}

export function useAvaxChartData(days: number = 1) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.avaxChart(days),
    queryFn: async (): Promise<ChartPoint[]> => {
      const result = await coingecko.getMarketChart('avalanche-2', days);
      return result.prices.map(([timestamp, price]) => ({
        time: timestamp,
        price,
      }));
    },
    refetchInterval: 60_000,
  });

  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch chart data') : null,
  };
}
