import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI, POSITION_ABI } from '@/app/config/options-abis';
import { queryKeys } from './queryKeys';
import type { PositionDisplay } from '@/app/types/options';
import { tickToPrice } from '@/app/utils/options';
import { detectAsset } from '@/app/config/asset-registry';

const POSITION_OPENED_EVENT = parseAbiItem(
  'event PositionOpened(uint256 indexed positionId, address indexed trader, uint256 indexed marketId, int256 lowerTick, int256 upperTick, uint128 quantity, uint256 cost)'
);

// Fuji RPC limits getLogs to 2048 blocks per call
const LOG_CHUNK_SIZE = 2048n;
// Fuji averages ~2s per block
const AVG_BLOCK_TIME = 2;

export function useOptionsPositions() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  const { data: positions, isLoading, error } = useQuery({
    queryKey: queryKeys.optionsPositions(address ?? ''),
    queryFn: async (): Promise<PositionDisplay[]> => {
      if (!publicClient || !address) throw new Error('Not connected');

      const positionIds = await publicClient.readContract({
        address: OPTIONS_CONTRACTS.position,
        abi: POSITION_ABI,
        functionName: 'getPositionsByOwner',
        args: [address],
      });

      if (!positionIds || positionIds.length === 0) return [];

      // Step 1: Fetch all position data + values in parallel
      const posEntries: {
        pid: bigint;
        pos: { marketId: bigint; lowerTick: bigint; upperTick: bigint; quantity: bigint; createdAt: bigint };
        value: bigint;
      }[] = [];

      await Promise.all(
        positionIds.map(async (pid) => {
          try {
            const [posData, value] = await Promise.all([
              publicClient.readContract({
                address: OPTIONS_CONTRACTS.position,
                abi: POSITION_ABI,
                functionName: 'getPosition',
                args: [pid],
              }),
              publicClient.readContract({
                address: OPTIONS_CONTRACTS.core,
                abi: CORE_ABI,
                functionName: 'calculatePositionValue',
                args: [pid],
              }),
            ]);
            posEntries.push({
              pid,
              pos: posData as { marketId: bigint; lowerTick: bigint; upperTick: bigint; quantity: bigint; createdAt: bigint },
              value: value as bigint,
            });
          } catch (err) {
            console.error(`Failed to fetch position ${pid}:`, err);
          }
        }),
      );

      // Step 2: Estimate block ranges from createdAt timestamps and fetch cost basis
      const costBasisMap = new Map<number, bigint>();
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const latestBlock = await publicClient.getBlock({ blockNumber: currentBlock });
        const currentTimestamp = Number(latestBlock.timestamp);

        // Estimate block number for each position's creation time
        const estimatedBlocks = posEntries.map((e) => {
          const age = currentTimestamp - Number(e.pos.createdAt);
          const blocksAgo = BigInt(Math.ceil(age / AVG_BLOCK_TIME));
          // Add buffer for estimation error (±500 blocks)
          return currentBlock > blocksAgo + 500n ? currentBlock - blocksAgo - 500n : 0n;
        });

        // Find the min estimated block (earliest position)
        const minEstBlock = estimatedBlocks.length > 0
          ? estimatedBlocks.reduce((min, b) => b < min ? b : min, currentBlock)
          : currentBlock;

        // Query logs in 2048-block chunks from minEstBlock to current
        let from = minEstBlock;
        while (from <= currentBlock) {
          const to = from + LOG_CHUNK_SIZE - 1n > currentBlock ? currentBlock : from + LOG_CHUNK_SIZE - 1n;
          try {
            const logs = await publicClient.getLogs({
              address: OPTIONS_CONTRACTS.core,
              event: POSITION_OPENED_EVENT,
              args: { trader: address },
              fromBlock: from,
              toBlock: to,
            });
            for (const log of logs) {
              const pid = Number(log.args.positionId);
              const cost = log.args.cost ?? 0n;
              costBasisMap.set(pid, (costBasisMap.get(pid) ?? 0n) + cost);
            }
          } catch {
            // Skip chunk on error
          }
          from = to + 1n;
        }
      } catch (err) {
        console.warn('[Positions] Failed to fetch PositionOpened logs:', err);
      }

      // Step 3: Fetch market data and build results
      // Cache market data to avoid duplicate fetches
      const marketCache = new Map<number, { state: number; tickDivisor: number; settled: boolean; settlementTick: bigint }>();

      const results: PositionDisplay[] = [];
      for (const { pid, pos, value } of posEntries) {
        try {
          const mId = Number(pos.marketId);
          if (!marketCache.has(mId)) {
            const [stateRaw, marketData] = await Promise.all([
              publicClient.readContract({
                address: OPTIONS_CONTRACTS.core,
                abi: CORE_ABI,
                functionName: 'getMarketState',
                args: [pos.marketId],
              }),
              publicClient.readContract({
                address: OPTIONS_CONTRACTS.core,
                abi: CORE_ABI,
                functionName: 'markets',
                args: [pos.marketId],
              }),
            ]);
            const mArr = marketData as readonly unknown[];
            const mMinTick = mArr[12] as bigint;
            const mMaxTick = mArr[13] as bigint;
            const mSettled = mArr[1] as boolean;
            const mSettlementTick = mArr[15] as bigint;
            const asset = detectAsset(mMinTick, mMaxTick);
            marketCache.set(mId, {
              state: Number(stateRaw),
              tickDivisor: asset.tickDivisor,
              settled: mSettled,
              settlementTick: mSettlementTick,
            });
          }

          const { state, tickDivisor, settled, settlementTick } = marketCache.get(mId)!;

          // Determine winner status: position wins if settlementTick is within [lowerTick, upperTick)
          const isWinner = settled
            ? pos.lowerTick <= settlementTick && pos.upperTick > settlementTick
            : null;

          results.push({
            positionId: Number(pid),
            marketId: mId,
            lowerTick: pos.lowerTick,
            upperTick: pos.upperTick,
            quantity: pos.quantity,
            costBasis: costBasisMap.get(Number(pid)) ?? 0n,
            currentValue: value,
            claimed: false,
            marketState: state,
            lowerPrice: tickToPrice(pos.lowerTick, tickDivisor),
            upperPrice: tickToPrice(pos.upperTick, tickDivisor),
            tickDivisor,
            settlementTick: settled ? settlementTick : null,
            isWinner,
          });
        } catch (err) {
          console.error(`Failed to process position ${pid}:`, err);
        }
      }

      return results;
    },
    enabled: !!publicClient && !!address,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  return {
    positions: positions ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch positions') : null,
  };
}
