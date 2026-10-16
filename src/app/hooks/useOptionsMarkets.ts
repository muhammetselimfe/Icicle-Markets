import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI } from '@/app/config/options-abis';
import { queryKeys } from './queryKeys';
import type { MarketDisplay } from '@/app/types/options';
import { tickToPrice, getMarketStateLabel } from '@/app/utils/options';
import { detectAsset } from '@/app/config/asset-registry';

// Market struct field indices (24-field struct)
const F = {
  isSeeded: 0,
  settled: 1,
  numBins: 4,
  startTimestamp: 8,
  endTimestamp: 9,
  settlementTimestamp: 10,
  minTick: 12,
  maxTick: 13,
  tickSpacing: 14,
  settlementTick: 15,
  settlementValue: 16,
  dynamicEnabled: 24,
  perBinCap: 28,
  // v2.1 (appended)
  dynVersion: 36,
  tradingHalted: 37,
} as const;

export function useOptionsMarkets() {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  const { data: markets, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.optionsMarkets(),
    queryFn: async (): Promise<MarketDisplay[]> => {
      if (!publicClient) throw new Error('No public client');

      // nextMarketId equals the ID of the last created market (0 = none)
      const nextId = await publicClient.readContract({
        address: OPTIONS_CONTRACTS.core,
        abi: CORE_ABI,
        functionName: 'nextMarketId',
      });

      const lastId = Number(nextId);
      if (lastId === 0) return [];

      const results: MarketDisplay[] = [];

      for (let id = 1; id <= lastId; id++) {
        try {
          const [marketData, stateRaw] = await Promise.all([
            publicClient.readContract({
              address: OPTIONS_CONTRACTS.core,
              abi: CORE_ABI,
              functionName: 'markets',
              args: [BigInt(id)],
            }),
            publicClient.readContract({
              address: OPTIONS_CONTRACTS.core,
              abi: CORE_ABI,
              functionName: 'getMarketState',
              args: [BigInt(id)],
            }),
          ]);

          const m = marketData as readonly unknown[];
          const isSeeded = m[F.isSeeded] as boolean;
          const settled = m[F.settled] as boolean;
          const numBins = Number(m[F.numBins]);
          const startTimestamp = Number(m[F.startTimestamp]);
          const endTimestamp = Number(m[F.endTimestamp]);
          const settlementTimestamp = Number(m[F.settlementTimestamp]);
          const minTick = m[F.minTick] as bigint;
          const maxTick = m[F.maxTick] as bigint;
          const tickSpacing = m[F.tickSpacing] as bigint;
          const settlementTick = m[F.settlementTick] as bigint;
          const settlementValue = m[F.settlementValue] as bigint;
          const dynamicEnabled = Boolean(m[F.dynamicEnabled]);
          const perBinCap = (m[F.perBinCap] as bigint | undefined) ?? 0n;
          const tradingHalted = Boolean(m[F.tradingHalted]); // undefined on pre-v2.1 cores => false

          const state = Number(stateRaw);

          // Detect asset from tick range
          const asset = detectAsset(minTick, maxTick);

          results.push({
            marketId: id,
            state,
            stateLabel: getMarketStateLabel(state, settled),
            settled,
            isSeeded,
            dynamicEnabled,
            tradingHalted,
            perBinCap,
            minTick,
            maxTick,
            tickSpacing,
            numBins,
            tradingStart: startTimestamp,
            tradingEnd: endTimestamp,
            settlementTimestamp,
            minPrice: tickToPrice(minTick, asset.tickDivisor),
            maxPrice: tickToPrice(maxTick, asset.tickDivisor),
            tickDivisor: asset.tickDivisor,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            feedId: asset.feedId,
            coingeckoId: asset.coingeckoId,
            assetLogo: asset.logo,
            accentColor: asset.accentColor,
            priceDecimals: asset.priceDecimals,
            dailyVol: asset.dailyVol,
            settlementTick: settled ? settlementTick : null,
            settlementPrice: settled ? Number(settlementValue) / 1e6 / asset.tickDivisor : null,
          });
        } catch (err) {
          console.error(`Failed to fetch market ${id}:`, err);
        }
      }

      return results;
    },
    enabled: !!publicClient,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  return {
    markets: markets ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch markets') : null,
    refetch: async () => { await refetch(); },
  };
}
