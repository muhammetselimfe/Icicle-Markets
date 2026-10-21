import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { coingecko } from '@/app/services/coingecko';
import { getTokenByAddress } from '@/app/data/markets-tokens';
import { queryKeys } from './queryKeys';

/**
 * USD reference prices for the tokens on each side of a swap. Used to show dollar
 * values under the amounts and to measure price impact against the market rate.
 * Tokens not in the curated list have no price (returns null).
 */
export function useSwapPrices(addresses: string[]) {
  const ids = Array.from(
    new Set(addresses.map((a) => getTokenByAddress(a)?.coingeckoId).filter((id): id is string => !!id)),
  ).sort();
  const key = ids.join(',');

  const { data } = useQuery({
    queryKey: queryKeys.swapPrices(key),
    queryFn: () => coingecko.getSimplePrice(ids, false, false, false),
    enabled: ids.length > 0,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const priceOf = useCallback(
    (address: string): number | null => {
      const id = getTokenByAddress(address)?.coingeckoId;
      const usd = id ? data?.[id]?.usd : undefined;
      return typeof usd === 'number' && usd > 0 ? usd : null;
    },
    [data],
  );

  return { priceOf };
}
