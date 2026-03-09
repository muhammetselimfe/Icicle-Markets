import { useQuery } from '@tanstack/react-query';

export interface ChartPoint {
  time: number;
  price: number;
}

const REDSTONE_API = 'https://api.redstone.finance';

/**
 * Fetch historical price data for the chart via Redstone history API.
 * All assets use Redstone as the single data source for consistency
 * with the settlement oracle.
 */
export function useAssetChartData(
  _coingeckoId: string | null,
  minutes: number = 1440,
  redstoneFeedId?: string,
) {
  const enabled = !!redstoneFeedId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['assetChart-redstone', redstoneFeedId, minutes],
    queryFn: async (): Promise<ChartPoint[]> => {
      if (!redstoneFeedId) return [];

      // Redstone returns ~1 point per minute. Fetch exactly `minutes` points.
      const pointsNeeded = minutes;
      const batchSize = 1000;
      const allPoints: ChartPoint[] = [];

      for (let offset = 0; offset < pointsNeeded; offset += batchSize) {
        const limit = Math.min(batchSize, pointsNeeded - offset);
        const url = `${REDSTONE_API}/prices?symbol=${redstoneFeedId}&provider=redstone&limit=${limit}&offset=${offset}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) break;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        for (const d of data) {
          allPoints.push({ time: d.timestamp, price: d.value });
        }
        if (data.length < limit) break; // no more data
      }

      // Redstone returns newest first — reverse to chronological order
      allPoints.reverse();

      // Downsample to ~200 points for performance
      if (allPoints.length > 200) {
        const step = Math.floor(allPoints.length / 200);
        const sampled: ChartPoint[] = [];
        for (let i = 0; i < allPoints.length; i += step) {
          sampled.push(allPoints[i]);
        }
        // Always include last point
        if (sampled[sampled.length - 1] !== allPoints[allPoints.length - 1]) {
          sampled.push(allPoints[allPoints.length - 1]);
        }
        return sampled;
      }

      return allPoints;
    },
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

/** @deprecated Use useAssetChartData instead */
export { useAssetChartData as useAvaxChartData };
