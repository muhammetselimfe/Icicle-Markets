import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { api } from '@/app/services/api';
import { coingecko, type SimplePriceData } from '@/app/services/coingecko';
import { MARKETS_TOKENS, type MarketToken } from '@/app/data/markets-tokens';
import type { TokenBalance, NativeBalance } from '@/app/types/api';

const NATIVE_AVAX_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const REFRESH_INTERVAL = 30000; // 30 seconds

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

export function usePortfolio(): PortfolioData {
  const { address, isConnected } = useAccount();

  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalChange24h, setTotalChange24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [txCount, setTxCount] = useState<number | null>(null);
  const [activeSince, setActiveSince] = useState<Date | null>(null);

  // Native AVAX balance using wagmi
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address: address,
  });

  // Get native AVAX token info
  const nativeAvaxToken = useMemo(
    () => MARKETS_TOKENS.find(t => t.address.toLowerCase() === NATIVE_AVAX_ADDRESS),
    []
  );

  const fetchPortfolio = useCallback(async () => {
    if (!isConnected || !address) {
      setHoldings([]);
      setTotalValue(0);
      setTotalChange24h(0);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // Fetch token balances and native balance from indexer in parallel
      const [balancesResponse, nativeResponse] = await Promise.all([
        api.getAddressBalances(address),
        api.getAddressNativeBalance(address).catch(() => null), // Fallback if not ready
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
      if (nativeResponse?.data) {
        setTxCount(nativeResponse.data.tx_count ?? null);
        setActiveSince(nativeResponse.data.first_tx_time ? new Date(nativeResponse.data.first_tx_time) : null);
      }

      // Collect all CoinGecko IDs we need to fetch prices for
      const coingeckoIds = new Set<string>();

      // Always include native AVAX
      if (nativeAvaxToken) {
        coingeckoIds.add(nativeAvaxToken.coingeckoId);
      }

      // Map token balances to known tokens and collect their CoinGecko IDs
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
          allocation: 0, // Calculate after totals
        });
      }

      // Add ERC-20 tokens with non-zero balances
      for (const { balance, token } of tokenMappings) {
        // Skip unknown tokens (potential scams/dust attacks) and zero balances
        if (!token || balance.balance === '0') continue;

        const decimals = balance.decimals ?? token.decimals ?? 18;
        const balanceRaw = BigInt(balance.balance);
        const balanceFormatted = formatUnits(balanceRaw, decimals);

        // Get price data from CoinGecko
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

      setHoldings(holdingsWithAllocation);
      setTotalValue(total);
      setTotalChange24h(weightedChange);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Portfolio fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, nativeAvaxToken, nativeBalance]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    setLoading(true);
    refetchNative();
    fetchPortfolio();
  }, [refetchNative, fetchPortfolio]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchPortfolio();

    const interval = setInterval(() => {
      fetchPortfolio();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // Refetch when native balance changes
  useEffect(() => {
    if (nativeBalance !== undefined) {
      fetchPortfolio();
    }
  }, [nativeBalance, fetchPortfolio]);

  return {
    holdings,
    totalValue,
    totalChange24h,
    loading,
    error,
    lastUpdated,
    txCount,
    activeSince,
    refetch,
  };
}
