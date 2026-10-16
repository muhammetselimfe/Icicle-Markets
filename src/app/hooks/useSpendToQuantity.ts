import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CHAIN_IDS, OPTIONS_CONTRACTS } from '@/app/config/wagmi';
import { CORE_ABI } from '@/app/config/options-abis';
import { queryKeys } from './queryKeys';

interface UseSpendToQuantityOptions {
  marketId: number;
  lowerTick: bigint | null;
  upperTick: bigint | null;
  spendUsdc: string; // e.g. "100" for $100
  /** Units the range can still take before the per-bin exposure cap (null = unknown / no cap) */
  maxUnits?: number | null;
}

interface SpendResult {
  /** Quantity in USDC units (human-readable, e.g. 2500.123) */
  quantity: number;
  /** Actual cost in USDC micro-units (bigint) */
  cost: bigint;
  /** Maximum possible spend in USDC (human-readable) before contract overflow, or null if no cap hit */
  maxSpend: number | null;
  /** Why the order was limited: market liquidity, or the per-bin exposure cap */
  limitedBy: 'liquidity' | 'cap' | null;
}

/**
 * Converts a desired USDC spend amount into the matching quantity
 * by running a binary search entirely inside a single React Query call.
 * No flickering — the UI only updates once with the final result.
 */
export function useSpendToQuantity({
  marketId,
  lowerTick,
  upperTick,
  spendUsdc,
  maxUnits = null,
}: UseSpendToQuantityOptions) {
  const publicClient = usePublicClient({ chainId: CHAIN_IDS.FUJI });

  // Debounce spend input (user typing)
  const [debouncedSpend, setDebouncedSpend] = useState(spendUsdc);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSpend(spendUsdc), 400);
    return () => clearTimeout(timer);
  }, [spendUsdc]);

  const spend = parseFloat(debouncedSpend);
  const spendMicro = !isNaN(spend) && spend > 0 ? BigInt(Math.round(spend * 1e6)) : null;

  const enabled =
    !!publicClient &&
    marketId > 0 &&
    lowerTick !== null &&
    upperTick !== null &&
    lowerTick < upperTick &&
    !!spendMicro;

  const { data, isFetching, error } = useQuery({
    queryKey: queryKeys.optionsSpendToQty(
      marketId,
      lowerTick?.toString() ?? '',
      upperTick?.toString() ?? '',
      debouncedSpend,
      maxUnits === null ? 'nocap' : String(Math.floor(maxUnits)),
    ),
    queryFn: async (): Promise<SpendResult> => {
      if (!publicClient || !spendMicro || lowerTick === null || upperTick === null) {
        throw new Error('Invalid params');
      }

      const targetCost = Number(spendMicro); // target in micro-USDC

      // Helper: get cost for a given quantity (human-readable number)
      const getCost = async (qty: number): Promise<bigint | null> => {
        if (qty <= 0) return 0n;
        const qtyMicro = BigInt(Math.round(qty * 1e6));
        if (qtyMicro <= 0n) return 0n;
        try {
          const cost = await publicClient.readContract({
            address: OPTIONS_CONTRACTS.core,
            abi: CORE_ABI,
            functionName: 'calculateOpenCost',
            args: [BigInt(marketId), lowerTick, upperTick, qtyMicro],
          });
          return cost as bigint;
        } catch {
          // Overflow or revert — quantity too high
          return null;
        }
      };

      // Binary search: find quantity where cost ≈ spend
      const MAX_ITER = 30;

      // Step 1: Find a valid starting quantity by searching downward
      let validQty = 0;
      let validCost = 0n;
      for (const tryQty of [spend, spend / 2, spend / 5, spend / 10, spend / 50, spend / 100, 1]) {
        if (tryQty < 0.001) continue;
        const c = await getCost(tryQty);
        if (c !== null) {
          validQty = tryQty;
          validCost = c;
          break;
        }
      }

      if (validQty <= 0) {
        // Nothing works — return zero
        return { quantity: 0, cost: 0n, maxSpend: null, limitedBy: null };
      }

      // Step 2: Find overflow ceiling by doubling from validQty
      let overflowQty: number | null = null; // first qty that reverts
      if (Number(validCost) < targetCost) {
        let current = validQty;
        for (let i = 0; i < 20; i++) {
          const tryQty = current * 2;
          const c = await getCost(tryQty);
          if (c === null) {
            overflowQty = tryQty;
            break;
          }
          current = tryQty;
          validQty = tryQty;
          validCost = c;
          if (Number(c) >= targetCost) break;
        }
      }

      // Step 3: If we hit overflow before reaching target cost,
      // binary search between validQty and overflowQty to find true max
      if (overflowQty !== null && Number(validCost) < targetCost) {
        let bLo = validQty;
        let bHi = overflowQty;
        for (let i = 0; i < 15; i++) {
          const mid = (bLo + bHi) / 2;
          if (bHi - bLo < 0.01) break;
          const c = await getCost(mid);
          if (c === null) {
            bHi = mid;
          } else {
            bLo = mid;
            validQty = mid;
            validCost = c;
          }
        }
      }

      // Step 4: Binary search between 0 and validQty for target cost
      let lo = 0;
      let hi = validQty;
      let bestQty = validQty;
      let bestCost = validCost;

      // Only search if we're above target (otherwise validQty IS the max and we're capped)
      if (Number(validCost) >= targetCost) {
        for (let i = 0; i < MAX_ITER; i++) {
          const mid = (lo + hi) / 2;
          if (hi - lo < 0.001) break;

          const cost = await getCost(mid);
          if (cost === null) { hi = mid; continue; }

          const costNum = Number(cost);
          const bestDiff = Math.abs(Number(bestCost) - targetCost);
          const midDiff = Math.abs(costNum - targetCost);
          if (midDiff < bestDiff) {
            bestQty = mid;
            bestCost = cost;
          }

          if (Math.abs(costNum / targetCost - 1) < 0.02) break;
          if (costNum > targetCost) { hi = mid; } else { lo = mid; }
        }
      }

      // Per-bin exposure cap: the contract rejects any order that pushes a bin past its cap,
      // so clamp the quantity to the range's headroom and quote that instead.
      if (maxUnits !== null && Number.isFinite(maxUnits) && bestQty > maxUnits) {
        const clampQty = Math.max(0, Math.floor(maxUnits * 1e6) / 1e6 - 0.000001);
        const c = clampQty > 0 ? await getCost(clampQty) : 0n;
        if (c !== null) return { quantity: clampQty, cost: c, maxSpend: Number(c) / 1e6, limitedBy: 'cap' };
      }

      // Check if we hit the liquidity ceiling (couldn't reach target spend)
      const costNum = Number(bestCost);
      const capped = costNum < targetCost * 0.95; // more than 5% below target
      return {
        quantity: bestQty,
        cost: bestCost,
        maxSpend: capped ? costNum / 1e6 : null,
        limitedBy: capped ? 'liquidity' : null,
      };
    },
    enabled,
    staleTime: 15_000,
    gcTime: 30_000,
    retry: 1,
  });

  return {
    /** Quantity in human-readable units (e.g. 2500.12) */
    quantity: data?.quantity ?? 0,
    /** Cost in micro-USDC (bigint) */
    cost: data?.cost ?? null,
    /** Max possible spend in USDC if contract caps out, or null */
    maxSpend: data?.maxSpend ?? null,
    /** 'cap' when the per-bin exposure cap limited the order, 'liquidity' when the book did */
    limitedBy: data?.limitedBy ?? null,
    loading: isFetching,
    error: error ? (error instanceof Error ? error.message : 'Failed to calculate') : null,
  };
}
