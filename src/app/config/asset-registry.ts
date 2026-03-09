/**
 * Asset registry for options markets.
 * Maps on-chain tick ranges to asset metadata (symbol, price feed, logos, etc.)
 * Since asset info isn't stored on-chain, we derive it from tick range heuristics.
 */

export interface AssetConfig {
  symbol: string;
  name: string;
  /** Redstone oracle feed ID */
  feedId: string;
  /** CoinGecko ID for chart data (null if no chart available) */
  coingeckoId: string | null;
  /** 100 for cent-based ticks (AVAX), 1 for dollar-based ticks (XAU, BTC) */
  tickDivisor: number;
  /** Logo URL */
  logo: string;
  /** Price formatting decimals */
  priceDecimals: number;
  /** Accent color for the market card */
  accentColor: string;
}

const ASSETS: AssetConfig[] = [
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    feedId: 'AVAX',
    coingeckoId: 'avalanche-2',
    tickDivisor: 100,
    priceDecimals: 2,
    logo: 'https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
    accentColor: '#E84142',
  },
  {
    symbol: 'WTI',
    name: 'Crude Oil',
    feedId: 'WTI',
    coingeckoId: null,
    tickDivisor: 1,
    priceDecimals: 0,
    logo: '/assets/oil.svg',
    accentColor: '#4a9eff',
  },
  {
    symbol: 'XAU',
    name: 'Gold',
    feedId: 'XAU',
    coingeckoId: 'tether-gold',
    tickDivisor: 1,
    priceDecimals: 0,
    logo: '/assets/gold.svg',
    accentColor: '#FFD700',
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    feedId: 'BTC',
    coingeckoId: 'bitcoin',
    tickDivisor: 1,
    priceDecimals: 0,
    logo: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png',
    accentColor: '#F7931A',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    feedId: 'ETH',
    coingeckoId: 'ethereum',
    tickDivisor: 1,
    priceDecimals: 0,
    logo: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png',
    accentColor: '#627EEA',
  },
];

/** Default fallback for unknown assets */
const UNKNOWN_ASSET: AssetConfig = {
  symbol: '???',
  name: 'Unknown',
  feedId: '',
  coingeckoId: null,
  tickDivisor: 1,
  priceDecimals: 2,
  logo: '',
  accentColor: '#8be4ff',
};

/**
 * Detect asset from market tick range.
 * Ticks are either cents (AVAX) or dollars (everything else).
 *
 * - AVAX (dollar): minTick < 30, dollar ticks (legacy 15-min test markets, e.g. $4-$14)
 * - WTI:  dollar ticks, 30 <= minTick < 200 (oil ~$30-$200)
 * - AVAX: cent ticks,   200 <= minTick < 2000 (prices $2-$20)
 * - XAU:  dollar ticks, 2000 <= minTick < 20000 (gold ~$2k-$10k)
 * - BTC:  dollar ticks, minTick >= 20000 (BTC ~$20k+)
 */
export function detectAsset(minTick: bigint, maxTick: bigint): AssetConfig {
  const min = Number(minTick);

  // Legacy AVAX dollar-tick markets (e.g. minTick=4, $4-$14 test markets)
  if (min < 30) {
    return { ...ASSETS.find(a => a.symbol === 'AVAX')!, tickDivisor: 1 };
  }

  // WTI: dollar-based ticks. Typical: minTick=56 ($56), maxTick=156 ($156)
  if (min >= 30 && min < 200) {
    return ASSETS.find(a => a.symbol === 'WTI')!;
  }

  // AVAX: cent-based ticks. Typical: minTick=700 ($7), maxTick=1100 ($11)
  if (min >= 200 && min < 2000) {
    return ASSETS.find(a => a.symbol === 'AVAX')!;
  }

  // Gold: dollar-based ticks in thousands range
  if (min >= 2000 && min < 20000) {
    return ASSETS.find(a => a.symbol === 'XAU')!;
  }

  // BTC: dollar-based ticks in tens of thousands+
  if (min >= 20000) {
    return ASSETS.find(a => a.symbol === 'BTC')!;
  }

  return UNKNOWN_ASSET;
}

export function getAssetBySymbol(symbol: string): AssetConfig {
  return ASSETS.find(a => a.symbol === symbol) ?? UNKNOWN_ASSET;
}
