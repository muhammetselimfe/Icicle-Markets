// CoinGecko API Client for Token Market Data

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
  sparkline_in_7d?: {
    price: number[];
  };
}

export interface SimplePriceData {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
  };
}

// Map common Avalanche token symbols to CoinGecko IDs
export const AVALANCHE_TOKEN_IDS: Record<string, string> = {
  'AVAX': 'avalanche-2',
  'WAVAX': 'wrapped-avax',
  'JOE': 'joe',
  'QI': 'benqi',
  'PNG': 'pangolin',
  'PTP': 'platypus-finance',
  'GMX': 'gmx',
  'STG': 'stargate-finance',
  'USDC': 'usd-coin',
  'USDC.e': 'usd-coin-avalanche-bridged-usdc-e',
  'USDT': 'tether',
  'USDT.e': 'tether-avalanche-bridged-usdt-e',
  'DAI': 'dai',
  'WETH.e': 'weth',
  'WBTC.e': 'wrapped-bitcoin',
  'LINK.e': 'chainlink',
  'AAVE.e': 'aave',
  'sAVAX': 'benqi-liquid-staked-avax',
  'ggAVAX': 'gogopool-ggavax',
  'YAK': 'yield-yak',
};

class CoinGeckoClient {
  private baseUrl: string;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheDuration = 60000; // 1 minute cache

  constructor(baseUrl: string = COINGECKO_BASE) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string, useCache = true): Promise<T> {
    const cacheKey = endpoint;

    // Check cache
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
        return cached.data as T;
      }
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('CoinGecko rate limit exceeded. Please wait a moment.');
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    // Store in cache
    this.cache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  }

  // Get market data for Avalanche ecosystem tokens
  async getAvalancheTokens(
    perPage: number = 50,
    page: number = 1,
    sparkline: boolean = true
  ): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      category: 'avalanche-ecosystem',
      order: 'market_cap_desc',
      per_page: perPage.toString(),
      page: page.toString(),
      sparkline: sparkline.toString(),
      price_change_percentage: '24h,7d',
    });

    return this.fetch<CoinMarketData[]>(`/coins/markets?${params}`);
  }

  // Get simple price for specific tokens
  async getSimplePrice(
    coinIds: string[],
    includeMarketCap = true,
    include24hVol = true,
    include24hChange = true
  ): Promise<SimplePriceData> {
    const params = new URLSearchParams({
      ids: coinIds.join(','),
      vs_currencies: 'usd',
      include_market_cap: includeMarketCap.toString(),
      include_24hr_vol: include24hVol.toString(),
      include_24hr_change: include24hChange.toString(),
    });

    return this.fetch<SimplePriceData>(`/simple/price?${params}`);
  }

  // Get AVAX price specifically (commonly needed)
  async getAvaxPrice(): Promise<{
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
  }> {
    const data = await this.getSimplePrice(['avalanche-2']);
    const avax = data['avalanche-2'];

    return {
      price: avax.usd,
      change24h: avax.usd_24h_change || 0,
      marketCap: avax.usd_market_cap || 0,
      volume24h: avax.usd_24h_vol || 0,
    };
  }

  // Get market data for specific coin IDs
  async getMarketData(
    coinIds: string[],
    sparkline: boolean = true
  ): Promise<CoinMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      ids: coinIds.join(','),
      order: 'market_cap_desc',
      sparkline: sparkline.toString(),
      price_change_percentage: '24h,7d',
    });

    return this.fetch<CoinMarketData[]>(`/coins/markets?${params}`);
  }

  // Get global crypto market data
  async getGlobalData(): Promise<{
    total_market_cap: { usd: number };
    total_volume: { usd: number };
    market_cap_change_percentage_24h_usd: number;
    active_cryptocurrencies: number;
  }> {
    const response = await this.fetch<{
      data: {
        total_market_cap: { usd: number };
        total_volume: { usd: number };
        market_cap_change_percentage_24h_usd: number;
        active_cryptocurrencies: number;
      };
    }>('/global');
    return response.data;
  }

  // Clear cache (useful for manual refresh)
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const coingecko = new CoinGeckoClient();

// Export class for testing
export { CoinGeckoClient };
