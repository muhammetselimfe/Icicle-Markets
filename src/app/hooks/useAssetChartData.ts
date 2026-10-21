import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchRedstonePriceHistory,
  historyRangeForMinutes,
  sliceAndDownsample,
  type ChartPoint,
} from '@/app/services/redstone';

export type { ChartPoint };

/**
 * Historical price data for the options chart.
 *
 * All assets use RedStone as the single data source so the chart matches the
 * settlement oracle. One request per (feed, backend range) is shared across
 * the 15m / 1H / 4H / 1D tabs; the timeframe slice happens client-side.
 */
export function useAssetChartData(
  _coingeckoId: string | null,
  minutes: number = 1440,
  redstoneFeedId?: string,
) {
  const enabled = !!redstoneFeedId;
  const rangeDays = historyRangeForMinutes(minutes);

  const select = useCallback(
    (points: ChartPoint[]) => sliceAndDownsample(points, minutes),
    [minutes],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['assetChart-redstone', redstoneFeedId, rangeDays],
    queryFn: () => fetchRedstonePriceHistory(redstoneFeedId!, rangeDays),
    select,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch chart data') : null,
  };
}
