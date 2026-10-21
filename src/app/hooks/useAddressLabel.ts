import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addressLabels, resolveLabel, type ResolvedLabel } from '@/app/services/address-labels';
import { getAddressInfo } from '@/app/data/known-addresses';
import { queryKeys } from './queryKeys';
import type { AddressLabel } from '@/app/types/api';

/**
 * Label for one address. Pass `hint` when the label came embedded in a transaction row
 * (`from_label`, `to_label`, `token_label`) so no request is made; otherwise lookups from
 * every link on the page are batched into one call to the indexer.
 */
export function useAddressLabel(address: string | null | undefined, hint?: AddressLabel | null): ResolvedLabel | null {
  const key = address?.toLowerCase() ?? '';
  const curated = !!getAddressInfo(key);
  const known = hint !== undefined ? hint : key ? addressLabels.peek(key) : undefined;

  useEffect(() => {
    if (key && hint !== undefined) addressLabels.prime(key, hint);
  }, [key, hint]);

  const { data } = useQuery({
    queryKey: queryKeys.addressLabel(key),
    queryFn: () => addressLabels.get(key),
    enabled: !!key && !curated && known === undefined,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return resolveLabel(key, known !== undefined ? known : data);
}
