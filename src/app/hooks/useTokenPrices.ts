import { useState, useEffect, useCallback } from 'react';
import { coingecko, type CoinMarketData } from '../services/coingecko';
import { MARKETS_TOKENS, type MarketToken, type TokenCategory } from '../data/markets-tokens';

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
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      setError(null);
      const data = await coingecko.getAvalancheTokens(limit);
      const transformed = data.map(transformToken);
      setTokens(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch token prices');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchTokens();

    // Refresh every 60 seconds (CoinGecko rate limits)
    const interval = setInterval(fetchTokens, 60000);
    return () => clearInterval(interval);
  }, [fetchTokens]);

  return { tokens, loading, error, refetch: fetchTokens };
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
  const [data, setData] = useState({
    price: 0,
    change24h: 0,
    marketCap: 0,
    volume24h: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      setError(null);
      const avaxData = await coingecko.getAvaxPrice();
      setData(avaxData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch AVAX price');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();

    // Refresh every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return { ...data, loading, error };
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

// Hook for curated market tokens with categories
export function useMarketTokens(): UseTokenPricesResult {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      setError(null);

      // Get all coingecko IDs from our curated list
      const coinIds = MARKETS_TOKENS.map(t => t.coingeckoId);

      // Fetch market data for these specific tokens
      const data = await coingecko.getMarketData(coinIds, true);

      // Map the coingecko data back to our tokens with categories
      const tokenMap = new Map(MARKETS_TOKENS.map(t => [t.coingeckoId, t]));

      const transformed: TokenData[] = data.map((coin: CoinMarketData) => {
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

      // Sort by market cap descending
      transformed.sort((a, b) => b.marketCap - a.marketCap);

      setTokens(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch token prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();

    // Refresh every 60 seconds
    const interval = setInterval(fetchTokens, 60000);
    return () => clearInterval(interval);
  }, [fetchTokens]);

  return { tokens, loading, error, refetch: fetchTokens };
}
