import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI } from '@/app/config/options-abis';

/**
 * The price the CONTRACT is currently pricing against: the last oracle tick written
 * on-chain by a refresh (or by a trade carrying a signed price). Odds, "most likely"
 * and the quote all come from this centre, not from the live RedStone price the page
 * shows, so the two can sit in different bins between refreshes.
 */
export function useSyncedOracle({ marketId, enabled = true }: { marketId: number; enabled?: boolean }) {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  const { data } = useQuery({
    queryKey: ['syncedOracle', marketId],
    queryFn: async (): Promise<{ tick: bigint; ts: number }> => {
      if (!publicClient) throw new Error('No public client');
      const m = (await publicClient.readContract({
        address: OPTIONS_CONTRACTS.core,
        abi: CORE_ABI,
        functionName: 'markets',
        args: [BigInt(marketId)],
      })) as readonly unknown[];
      // Market struct: [26] cachedOracleTs, [27] cachedOracleTick
      return { tick: m[27] as bigint, ts: Number(m[26] as bigint) };
    },
    enabled: enabled && !!publicClient && marketId > 0,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  return { syncedTick: data?.tick ?? null, syncedTs: data?.ts ?? 0 };
}
