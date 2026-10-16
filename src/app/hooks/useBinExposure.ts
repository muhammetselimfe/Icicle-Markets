import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { POSITION_ABI } from '@/app/config/options-abis';

/**
 * Open payout units per bin for a market, summed from every open position (the
 * contract's per-bin exposure cap counts units, not dollars). Used to tell the
 * user how much a range can still take BEFORE the order reverts with
 * BinExposureCapExceeded, and to draw capacity on the ladder.
 */
export function useBinExposure({
  marketId,
  tickSpacing,
  enabled = true,
}: {
  marketId: number;
  tickSpacing: bigint;
  enabled?: boolean;
}) {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  const { data, isLoading } = useQuery({
    queryKey: ['binExposure', marketId],
    queryFn: async (): Promise<Map<string, bigint>> => {
      if (!publicClient) throw new Error('No public client');
      const ids = (await publicClient.readContract({
        address: OPTIONS_CONTRACTS.position,
        abi: POSITION_ABI,
        functionName: 'getMarketPositions',
        args: [BigInt(marketId)],
      })) as readonly bigint[];
      const exposure = new Map<string, bigint>();
      // positions are read in small batches to stay friendly to the public RPC
      const BATCH = 25;
      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const rows = await Promise.all(
          slice.map(async (pid) => {
            try {
              return (await publicClient.readContract({
                address: OPTIONS_CONTRACTS.position,
                abi: POSITION_ABI,
                functionName: 'getPosition',
                args: [pid],
              })) as { lowerTick: bigint; upperTick: bigint; quantity: bigint };
            } catch {
              return null; // burned / closed since the list was read
            }
          }),
        );
        for (const p of rows) {
          if (!p || p.quantity === 0n) continue;
          for (let t = p.lowerTick; t < p.upperTick; t += tickSpacing) {
            const k = t.toString();
            exposure.set(k, (exposure.get(k) ?? 0n) + p.quantity);
          }
        }
      }
      return exposure;
    },
    enabled: enabled && !!publicClient && marketId > 0 && tickSpacing > 0n,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return { exposure: data ?? null, loading: isLoading };
}

/** Units that can still be added to every bin of [lowerTick, upperTick) before the cap. */
export function rangeHeadroom(
  exposure: Map<string, bigint> | null,
  perBinCap: bigint,
  lowerTick: bigint | null,
  upperTick: bigint | null,
  tickSpacing: bigint,
): bigint | null {
  if (!exposure || perBinCap === 0n || lowerTick === null || upperTick === null) return null;
  let min: bigint | null = null;
  for (let t = lowerTick; t < upperTick; t += tickSpacing) {
    const used = exposure.get(t.toString()) ?? 0n;
    const room = perBinCap > used ? perBinCap - used : 0n;
    if (min === null || room < min) min = room;
  }
  return min;
}
