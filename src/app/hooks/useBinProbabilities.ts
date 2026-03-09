import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI } from '@/app/config/options-abis';
import { queryKeys } from './queryKeys';
import { generateTicks, tickToPrice } from '@/app/utils/options';
import { MarketState } from '@/app/types/options';

export interface BinData {
  tick: bigint;
  price: number;
  probability: number;
}

interface UseBinProbabilitiesOptions {
  marketId: number;
  minTick: bigint;
  maxTick: bigint;
  tickSpacing: bigint;
  marketState: MarketState;
  tickDivisor?: number;
}

export function useBinProbabilities({
  marketId,
  minTick,
  maxTick,
  tickSpacing,
  marketState,
  tickDivisor = 1,
}: UseBinProbabilitiesOptions) {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  const enabled =
    !!publicClient &&
    marketId > 0 &&
    marketState === MarketState.Trading;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.binProbabilities(marketId),
    queryFn: async (): Promise<{ bins: BinData[]; mostLikelyPrice: number | null }> => {
      if (!publicClient) throw new Error('No public client');

      const ticks = generateTicks(minTick, maxTick, tickSpacing);
      // Each bin spans [tick, tick + tickSpacing)
      // We query the cost for a 1 USDC position in each single-tick bin
      const PROBE_QTY = 1_000_000n; // 1 USDC

      const costs = await Promise.all(
        ticks.map(async (tick) => {
          try {
            const cost = await publicClient.readContract({
              address: OPTIONS_CONTRACTS.core,
              abi: CORE_ABI,
              functionName: 'calculateOpenCost',
              args: [BigInt(marketId), tick, tick + tickSpacing, PROBE_QTY],
            });
            return { tick, cost: cost as bigint };
          } catch (err) {
            console.warn(`[BinProb] calculateOpenCost reverted for tick ${tick}:`, err instanceof Error ? err.message.slice(0, 80) : err);
            return { tick, cost: 0n };
          }
        }),
      );

      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0n);

      let maxProb = 0;
      let mostLikelyPrice = tickToPrice(minTick, tickDivisor);

      const bins: BinData[] = costs.map(({ tick, cost }) => {
        const probability =
          totalCost > 0n ? Number(cost) / Number(totalCost) : 0;
        const price = tickToPrice(tick, tickDivisor);
        if (probability > maxProb) {
          maxProb = probability;
          mostLikelyPrice = price;
        }
        return { tick, price, probability };
      });

      // If distribution is essentially uniform (no real trading), don't highlight any bin
      const minP = Math.min(...bins.map(b => b.probability));
      const isUniform = bins.length > 0 && maxProb > 0 && (maxProb - minP) / maxProb < 0.02;

      return { bins, mostLikelyPrice: isUniform ? null : mostLikelyPrice };
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  return {
    bins: data?.bins ?? [],
    mostLikelyPrice: data?.mostLikelyPrice ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch probabilities') : null,
  };
}
