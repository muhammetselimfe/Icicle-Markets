import { useQuery } from '@tanstack/react-query';
import { coingecko, type CoinMarketData } from '../services/coingecko';
import { getTokenPools } from '../services/geckoterminal';
import { MARKETS_TOKENS, type TokenCategory } from '../data/markets-tokens';
import { queryKeys } from './queryKeys';

export interface TokenData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  sparkline: number[];
  rank: number;
  category?: TokenCategory;
  address?: string;
  restricted?: boolean;
}

interface UseTokenPricesResult {
  tokens: TokenData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Transform CoinGecko data to our format
function transformToken(coin: CoinMarketData): TokenData {
  return {
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    image: coin.image,
    price: coin.current_price,
    change24h: coin.price_change_percentage_24h || 0,
    marketCap: coin.market_cap,
    volume24h: coin.total_volume,
    sparkline: coin.sparkline_in_7d?.price || [],
    rank: coin.market_cap_rank || 0,
  };
}

export function useTokenPrices(limit: number = 50): UseTokenPricesResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.tokenPrices(limit),
    queryFn: async () => {
      const rawData = await coingecko.getAvalancheTokens(limit);
      return rawData.map(transformToken);
    },
    refetchInterval: 60_000,
  });

  return {
    tokens: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch token prices') : null,
    refetch: async () => { await refetch(); },
  };
}

// Hook specifically for AVAX price
interface UseAvaxPriceResult {
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  loading: boolean;
  error: string | null;
}

export function useAvaxPrice(): UseAvaxPriceResult {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.avaxPrice(),
    queryFn: () => coingecko.getAvaxPrice(),
    refetchInterval: 30_000,
  });

  return {
    price: data?.price ?? 0,
    change24h: data?.change24h ?? 0,
    marketCap: data?.marketCap ?? 0,
    volume24h: data?.volume24h ?? 0,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch AVAX price') : null,
  };
}

// Calculate market stats from tokens
export function useMarketStats(tokens: TokenData[]) {
  const totalMarketCap = tokens.reduce((sum, t) => sum + t.marketCap, 0);
  const total24hVolume = tokens.reduce((sum, t) => sum + t.volume24h, 0);
  const tokenCount = tokens.length;

  // Weighted average 24h change based on market cap
  const weightedChange =
    tokens.length > 0
      ? tokens.reduce((sum, t) => sum + t.change24h * t.marketCap, 0) / totalMarketCap
      : 0;

  return {
    totalMarketCap,
    total24hVolume,
    tokenCount,
    avgChange24h: weightedChange,
  };
}

// ── Single-token detail + chart (for the token details page) ────────────────
export interface TokenDetail extends CoinMarketData {
  address?: string;
  category?: TokenCategory;
  restricted?: boolean;
}

export function useTokenDetail(id: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.tokenDetail(id ?? ''),
    queryFn: async (): Promise<TokenDetail | null> => {
      const rows = await coingecko.getMarketData([id!], false);
      const coin = rows[0];
      if (!coin) return null;
      const meta = MARKETS_TOKENS.find((t) => t.coingeckoId === id);
      return {
        ...coin,
        symbol: (meta?.symbol || coin.symbol).toUpperCase(),
        name: meta?.name || coin.name,
        image: meta?.logoUrl || coin.image,
        address: meta?.address,
        category: meta?.category,
        restricted: meta?.restricted,
      };
    },
    enabled: !!id,
    refetchInterval: 60_000,
  });

  return {
    token: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch token') : null,
    refetch: async () => { await refetch(); },
  };
}

export interface ChartPoint {
  time: number;
  price: number;
}

export function useTokenChart(id: string | undefined, days: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.tokenChart(id ?? '', days),
    queryFn: async (): Promise<ChartPoint[]> => {
      const res = await coingecko.getMarketChart(id!, days);
      return res.prices.map(([time, price]) => ({ time, price }));
    },
    enabled: !!id,
    refetchInterval: 60_000,
  });

  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch chart') : null,
  };
}

export function useTokenPools(address: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.tokenPools(address ?? ''),
    queryFn: () => getTokenPools(address!),
    enabled: !!address,
    staleTime: 60_000,
  });
  return {
    pools: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch pools') : null,
  };
}

export function useTokenVariants(ids: string[]) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tokenVariants(ids.join(',')),
    queryFn: () => coingecko.getMarketData(ids, false),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  return { variants: data ?? [], loading: isLoading };
}

export function useTokenInfo(id: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tokenInfo(id ?? ''),
    queryFn: () => coingecko.getCoinInfo(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
  return { info: data ?? null, loading: isLoading };
}

// Hook for curated market tokens with categories
export function useMarketTokens(): UseTokenPricesResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.marketTokens(),
    queryFn: async () => {
      const coinIds = MARKETS_TOKENS.map(t => t.coingeckoId);
      const rawData = await coingecko.getMarketData(coinIds, true);

      const tokenMap = new Map(MARKETS_TOKENS.map(t => [t.coingeckoId, t]));

      const transformed: TokenData[] = rawData.map((coin: CoinMarketData) => {
        const marketToken = tokenMap.get(coin.id);
        return {
          id: coin.id,
          symbol: marketToken?.symbol || coin.symbol.toUpperCase(),
          name: marketToken?.name || coin.name,
          image: marketToken?.logoUrl || coin.image,
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h || 0,
          marketCap: coin.market_cap,
          volume24h: coin.total_volume,
          sparkline: coin.sparkline_in_7d?.price || [],
          rank: coin.market_cap_rank || 0,
          category: marketToken?.category,
          address: marketToken?.address,
          restricted: marketToken?.restricted,
        };
      });

      transformed.sort((a, b) => b.marketCap - a.marketCap);
      return transformed;
    },
    refetchInterval: 60_000,
  });

  return {
    tokens: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch token prices') : null,
    refetch: async () => { await refetch(); },
  };
}
