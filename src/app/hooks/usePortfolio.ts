import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { api } from '@/app/services/api';
import { coingecko, type SimplePriceData } from '@/app/services/coingecko';
import { MARKETS_TOKENS, type MarketToken } from '@/app/data/markets-tokens';
import type { TokenBalance } from '@/app/types/api';
import { queryKeys } from './queryKeys';

const NATIVE_AVAX_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export interface PortfolioHolding {
  symbol: string;
  name: string;
  address: string;
  logoUrl?: string;
  balance: string;
  balanceRaw: bigint;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
  allocation: number;
}

export interface PortfolioData {
  holdings: PortfolioHolding[];
  totalValue: number;
  totalChange24h: number;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  txCount: number | null;
  activeSince: Date | null;
  refetch: () => void;
}

// Build a map of token address -> coingecko ID from our known tokens
const addressToCoingeckoId = new Map<string, MarketToken>();
for (const token of MARKETS_TOKENS) {
  addressToCoingeckoId.set(token.address.toLowerCase(), token);
}

interface PortfolioQueryData {
  holdings: PortfolioHolding[];
  totalValue: number;
  totalChange24h: number;
  lastUpdated: Date;
  txCount: number | null;
  activeSince: Date | null;
}

export function usePortfolio(): PortfolioData {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  // Native AVAX balance using wagmi
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address: address,
  });

  // Get native AVAX token info
  const nativeAvaxToken = useMemo(
    () => MARKETS_TOKENS.find(t => t.address.toLowerCase() === NATIVE_AVAX_ADDRESS),
    []
  );

  const { data, isLoading, error } = useQuery<PortfolioQueryData>({
    queryKey: [...queryKeys.portfolio(address ?? ''), nativeBalance?.value?.toString()],
    queryFn: async () => {
      // Fetch token balances and native balance from indexer in parallel
      const [balancesResponse, nativeResponse] = await Promise.all([
        api.getAddressBalances(address!),
        api.getAddressNativeBalance(address!).catch(() => null),
      ]);

      const tokenBalances: TokenBalance[] = balancesResponse.data || [];

      // Get native AVAX balance - prefer indexer, fallback to wagmi
      let nativeAvaxBalance: bigint = 0n;
      if (nativeResponse?.data?.balance) {
        nativeAvaxBalance = BigInt(nativeResponse.data.balance);
      } else if (nativeBalance?.value) {
        nativeAvaxBalance = nativeBalance.value;
      }

      // Extract tx_count and first_tx_time from native response
      const txCount = nativeResponse?.data?.tx_count ?? null;
      const activeSince = nativeResponse?.data?.first_tx_time
        ? new Date(nativeResponse.data.first_tx_time)
        : null;

      // Collect all CoinGecko IDs we need to fetch prices for
      const coingeckoIds = new Set<string>();
      if (nativeAvaxToken) {
        coingeckoIds.add(nativeAvaxToken.coingeckoId);
      }

      const tokenMappings: { balance: TokenBalance; token?: MarketToken }[] = [];
      for (const bal of tokenBalances) {
        const knownToken = addressToCoingeckoId.get(bal.token.toLowerCase());
        tokenMappings.push({ balance: bal, token: knownToken });
        if (knownToken) {
          coingeckoIds.add(knownToken.coingeckoId);
        }
      }

      // Fetch prices from CoinGecko
      let prices: SimplePriceData = {};
      if (coingeckoIds.size > 0) {
        try {
          prices = await coingecko.getSimplePrice(Array.from(coingeckoIds));
        } catch (priceError) {
          console.error('Failed to fetch prices:', priceError);
        }
      }

      // Build holdings array
      const portfolioHoldings: PortfolioHolding[] = [];

      // Add native AVAX if we have a balance
      if (nativeAvaxToken && nativeAvaxBalance > 0n) {
        const priceData = prices[nativeAvaxToken.coingeckoId];
        const priceUsd = priceData?.usd ?? 0;
        const change24h = priceData?.usd_24h_change ?? 0;
        const balanceFormatted = formatUnits(nativeAvaxBalance, 18);
        const valueUsd = parseFloat(balanceFormatted) * priceUsd;

        portfolioHoldings.push({
          symbol: nativeAvaxToken.symbol,
          name: nativeAvaxToken.name,
          address: nativeAvaxToken.address,
          logoUrl: nativeAvaxToken.logoUrl,
          balance: balanceFormatted,
          balanceRaw: nativeAvaxBalance,
          decimals: 18,
          priceUsd,
          valueUsd,
          change24h,
          allocation: 0,
        });
      }

      // Add ERC-20 tokens with non-zero balances
      for (const { balance, token } of tokenMappings) {
        if (!token || balance.balance === '0') continue;

        const decimals = balance.decimals ?? token.decimals ?? 18;
        const balanceRaw = BigInt(balance.balance);
        const balanceFormatted = formatUnits(balanceRaw, decimals);

        const priceData = prices[token.coingeckoId];
        const priceUsd = priceData?.usd ?? 0;
        const change24h = priceData?.usd_24h_change ?? 0;
        const valueUsd = parseFloat(balanceFormatted) * priceUsd;

        portfolioHoldings.push({
          symbol: token.symbol,
          name: token.name,
          address: balance.token,
          logoUrl: token.logoUrl,
          balance: balanceFormatted,
          balanceRaw,
          decimals,
          priceUsd,
          valueUsd,
          change24h,
          allocation: 0,
        });
      }

      // Calculate total value
      const total = portfolioHoldings.reduce((acc, h) => acc + h.valueUsd, 0);

      // Calculate weighted average 24h change
      let weightedChange = 0;
      if (total > 0) {
        weightedChange = portfolioHoldings.reduce(
          (acc, h) => acc + h.change24h * (h.valueUsd / total),
          0
        );
      }

      // Calculate allocation percentages
      const holdingsWithAllocation = portfolioHoldings.map(h => ({
        ...h,
        allocation: total > 0 ? (h.valueUsd / total) * 100 : 0,
      }));

      // Sort by value (highest first)
      holdingsWithAllocation.sort((a, b) => b.valueUsd - a.valueUsd);

      return {
        holdings: holdingsWithAllocation,
        totalValue: total,
        totalChange24h: weightedChange,
        lastUpdated: new Date(),
        txCount,
        activeSince,
      };
    },
    enabled: isConnected && !!address,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const handleRefetch = useCallback(() => {
    refetchNative();
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio(address ?? '') });
  }, [refetchNative, queryClient, address]);

  return {
    holdings: data?.holdings ?? [],
    totalValue: data?.totalValue ?? 0,
    totalChange24h: data?.totalChange24h ?? 0,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch portfolio') : null,
    lastUpdated: data?.lastUpdated ?? null,
    txCount: data?.txCount ?? null,
    activeSince: data?.activeSince ?? null,
    refetch: handleRefetch,
  };
}
