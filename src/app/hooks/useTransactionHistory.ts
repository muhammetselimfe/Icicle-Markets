import { useCallback, useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { api } from '@/app/services/api';
import {
  classifyTransaction,
  collectTransferLegs,
  describeCounterparty,
  formatCounterparty,
  formatLegAmount,
  getProtocol,
  intentTitle,
  methodLabel,
  NATIVE_AVAX_ADDRESS,
  type TransactionType,
} from '@/app/utils/transaction-history';
import { useSwapPrices } from './useSwapPrices';
import { queryKeys } from './queryKeys';
import type { Transaction as ApiTransaction } from '@/app/types/api';

export type { TransactionType };
export type TransactionStatus = 'success' | 'failed' | 'pending';

export interface TokenTransfer {
  symbol: string;
  amount: string;
  valueUsd: number;
  logoUrl?: string;
  direction: 'in' | 'out';
}

export interface Transaction {
  hash: string;
  timestamp: Date;
  type: TransactionType;
  status: TransactionStatus;
  protocol?: {
    name: string;
    logoUrl?: string;
  };
  /** Title to show in place of the generic one for the type, when the indexer gave a more specific one ("Borrowed"). */
  title: string | null;
  /** Who the wallet dealt with, ready to print: "via Yield Yak", "to Binance". */
  context: string;
  /** Called function in words ("Swap no split"); null for plain transfers. */
  method: string | null;
  /** Outgoing legs first, then incoming. */
  transfers: TokenTransfer[];
  gasFee: {
    amount: string;
    valueUsd: number;
  };
  blockNumber: number;
  from: string;
  to: string | null;
}

export interface TransactionHistoryData {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

const CHAIN_ID = 43114;
const LIMIT = 20;
/** Parallel detail lookups per page; the indexer rate-limits bursts. */
const DETAIL_CONCURRENCY = 4;
/** A plain AVAX transfer costs 21,000 gas; a row above that with no transfers may be waiting on logs. */
const PLAIN_TRANSFER_GAS = 21_000;
/** Logs can trail transactions by a few seconds; rows this young are completed from the detail endpoint. */
const FRESH_MS = 60_000;

function isFresh(tx: ApiTransaction): boolean {
  return Date.now() - Date.parse(tx.block_time) < FRESH_MS;
}

function hasNoMovements(tx: ApiTransaction): boolean {
  return (tx.token_transfers?.length ?? 0) === 0 && (tx.internal_txs?.length ?? 0) === 0 && (tx.approvals?.length ?? 0) === 0;
}

/** Rows from an older indexer lack the arrays; fresh rows can carry empty ones while logs catch up. */
function needsDetail(tx: ApiTransaction): boolean {
  if (tx.token_transfers === undefined) return true;
  return isFresh(tx) && tx.gas_used > PLAIN_TRANSFER_GAS && hasNoMovements(tx);
}

// The list endpoint carries token transfers, internal calls and approvals when asked
// with include=transfers. Rows from an indexer that predates the flag lack them and are
// completed from the per-transaction endpoint. Mined transactions never change, so
// details are cached for the life of the tab. A failed lookup falls back to the bare row.
const detailCache = new Map<string, Promise<ApiTransaction>>();

function fetchDetail(tx: ApiTransaction): Promise<ApiTransaction> {
  let pending = detailCache.get(tx.hash);
  if (!pending) {
    pending = api.getTransaction(tx.hash, CHAIN_ID).then(
      (res) => {
        const full = { ...tx, ...res.data };
        // Still nothing for a young call: logs have not landed, so do not pin that answer.
        if (isFresh(full) && full.gas_used > PLAIN_TRANSFER_GAS && hasNoMovements(full)) detailCache.delete(tx.hash);
        return full;
      },
      () => {
        detailCache.delete(tx.hash);
        return tx;
      },
    );
    detailCache.set(tx.hash, pending);
  }
  return pending;
}

async function withDetails(list: ApiTransaction[]): Promise<ApiTransaction[]> {
  const out: ApiTransaction[] = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(DETAIL_CONCURRENCY, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = needsDetail(list[i]) ? await fetchDetail(list[i]) : list[i];
    }
  });
  await Promise.all(workers);
  return out;
}

/** History for the signed-in wallet, or for `addressOverride` when given (explorer pages). */
export function useTransactionHistory(addressOverride?: string): TransactionHistoryData {
  const account = useAccount();
  const address = addressOverride ?? account.address;
  const isConnected = addressOverride ? true : account.isConnected;

  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.transactionHistory(address ?? ''),
    queryFn: async ({ pageParam = 0 }) => {
      const txResponse = await api.getAddressTransactions(address!, CHAIN_ID, LIMIT, pageParam * LIMIT, true);
      return withDetails(txResponse.data || []);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.length === LIMIT ? lastPageParam + 1 : undefined;
    },
    enabled: isConnected && !!address,
  });

  // Legs are derived once per fetched page; prices are layered on top so rows render
  // immediately and the USD column fills in when the (batched) price lookup lands.
  const summarized = useMemo(() => {
    if (!address) return [];
    return (data?.pages ?? []).flat().map((tx) => {
      const legs = collectTransferLegs(tx, address);
      const protocol = getProtocol(tx.to, tx.to_label);
      const type = classifyTransaction(tx, legs, protocol, address);
      return {
        tx,
        legs,
        protocol,
        type,
        title: tx.from.toLowerCase() === address.toLowerCase() ? intentTitle(tx) : null,
        context: formatCounterparty(describeCounterparty(tx, type, address, protocol)),
      };
    });
  }, [data, address]);

  const priceAddresses = useMemo(() => {
    const set = new Set<string>([NATIVE_AVAX_ADDRESS]);
    for (const row of summarized) for (const leg of row.legs) set.add(leg.token);
    return Array.from(set);
  }, [summarized]);
  const { priceOf } = useSwapPrices(priceAddresses);
  const avaxPrice = priceOf(NATIVE_AVAX_ADDRESS) ?? 0;

  const transactions: Transaction[] = useMemo(
    () =>
      summarized.map(({ tx, legs, protocol, type, title, context }) => {
        const gasFeeAvax = formatUnits(BigInt(tx.gas_used) * BigInt(tx.gas_price), 18);

        const transfers: TokenTransfer[] = legs.map((leg) => {
          const amount = parseFloat(formatUnits(leg.raw, leg.decimals));
          const price = priceOf(leg.token) ?? 0;
          return {
            symbol: leg.symbol,
            amount: formatLegAmount(leg.raw, leg.decimals),
            valueUsd: amount * price,
            logoUrl: leg.logoUrl,
            direction: leg.direction,
          };
        });

        return {
          hash: tx.hash,
          timestamp: new Date(tx.block_time),
          type,
          status: tx.success ? ('success' as const) : ('failed' as const),
          protocol: protocol ? { name: protocol.name, logoUrl: protocol.logoUrl } : undefined,
          title,
          context,
          method: methodLabel(tx.method),
          transfers,
          gasFee: {
            amount: parseFloat(gasFeeAvax).toFixed(6),
            valueUsd: parseFloat(gasFeeAvax) * avaxPrice,
          },
          blockNumber: tx.block_number,
          from: tx.from,
          to: tx.to,
        };
      }),
    [summarized, priceOf, avaxPrice],
  );

  const handleLoadMore = useCallback(() => {
    fetchNextPage();
  }, [fetchNextPage]);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    transactions,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch transactions') : null,
    hasMore: !!hasNextPage,
    loadMore: handleLoadMore,
    refetch: handleRefetch,
  };
}

// Get "active since" date (first transaction)
export function useActiveSince(): { date: Date | null; loading: boolean } {
  const { address, isConnected } = useAccount();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.activeSince(address ?? ''),
    queryFn: async () => {
      const response = await api.getAddressTransactions(address!, CHAIN_ID, 1, 0);
      if (response.data && response.data.length > 0) {
        return new Date(response.data[0].block_time);
      }
      return null;
    },
    enabled: isConnected && !!address,
    staleTime: Infinity,
  });

  return { date: data ?? null, loading: isLoading };
}
