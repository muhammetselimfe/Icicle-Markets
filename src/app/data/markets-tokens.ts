// Token list reference - contains all available tokens
import tokenlist from './tokenlist.json';

export type TokenCategory = 'majors' | 'stablecoins' | 'defi' | 'liquid-staking' | 'meme' | 'gaming' | 'rwa';

export interface MarketToken {
  symbol: string;
  name: string;
  coingeckoId: string;
  category: TokenCategory;
  address: string;
  decimals: number;
  logoUrl?: string;
  restricted?: boolean;
}

export const MARKET_CATEGORIES: Record<TokenCategory, string> = {
  'majors': 'Large cap cryptocurrencies',
  'stablecoins': 'Price-stable tokens',
  'defi': 'Decentralized finance protocols',
  'liquid-staking': 'Liquid staking derivatives',
  'meme': 'Community-driven meme tokens',
  'gaming': 'Gaming tokens',
  'rwa': 'Real world assets',
};

// ============================================================
// LISTED TOKENS - Add tokens here to show in markets & swap
// ============================================================
// Format: address (lowercase) -> { category, coingeckoId, logoUrl?, nameOverride?, symbolOverride? }
// Token info (name, symbol, decimals) is auto-pulled from tokenlist.json

interface ListedTokenConfig {
  category: TokenCategory;
  coingeckoId: string;
  logoUrl?: string;
  nameOverride?: string;
  symbolOverride?: string;
  /** Token is not publicly tradable (e.g. institutional only) */
  restricted?: boolean;
}

const LISTED_TOKENS: Record<string, ListedTokenConfig> = {
  // ===== MAJORS =====
  // Native AVAX (special address, not in tokenlist)
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': {
    category: 'majors',
    coingeckoId: 'avalanche-2',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
    nameOverride: 'Avalanche',
    symbolOverride: 'AVAX',
  },
  // WAVAX
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': {
    category: 'majors',
    coingeckoId: 'wrapped-avax',
  },
  // BTC.b
  '0x152b9d0fdc40c096757f570a51e494bd4b943e50': {
    category: 'majors',
    coingeckoId: 'bitcoin-avalanche-bridged-btc-b',
  },
  // WETH.e
  '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': {
    category: 'majors',
    coingeckoId: 'weth',
  },
  // LINK.e
  '0x5947bb275c521040051d82396192181b413227a3': {
    category: 'majors',
    coingeckoId: 'chainlink',
  },

  // ===== STABLECOINS =====
  // USDC
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': {
    category: 'stablecoins',
    coingeckoId: 'usd-coin',
  },
  // USDT
  '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7': {
    category: 'stablecoins',
    coingeckoId: 'tether',
  },
  // USDC.e
  '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': {
    category: 'stablecoins',
    coingeckoId: 'usd-coin-avalanche-bridged-usdc-e',
  },
  // DAI.e
  '0xd586e7f844cea2f87f50152665bcbc2c279d8d70': {
    category: 'stablecoins',
    coingeckoId: 'dai',
  },
  // AUSD (Agora Dollar)
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': {
    category: 'stablecoins',
    coingeckoId: 'agora-dollar',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/39284/small/AUSD_1024px.png',
  },
  // EURC (Euro Coin)
  '0xc891eb4cbdeff6e073e859e987815ed1505c2acd': {
    category: 'stablecoins',
    coingeckoId: 'euro-coin',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/26045/small/EURC.png',
  },

  // ===== DEFI =====
  // ALOT (Dexalot)
  '0x093783055f9047c2bff99c4e414501f8a147bc69': {
    category: 'defi',
    coingeckoId: 'dexalot',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/24188/small/logo_200x200.png',
  },
  // JOE
  '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd': {
    category: 'defi',
    coingeckoId: 'joe',
  },
  // GMX
  '0x62edc0692bd897d2295872a9ffcac5425011c661': {
    category: 'defi',
    coingeckoId: 'gmx',
  },
  // AAVE.e
  '0x63a72806098bd3d9520cc43356dd78afe5d386d9': {
    category: 'defi',
    coingeckoId: 'aave',
  },
  // PNG
  '0x60781c2586d68229fde47564546784ab3faca982': {
    category: 'defi',
    coingeckoId: 'pangolin',
  },
  // YAK
  '0x59414b3089ce2af0010e7523dea7e2b35d776ec7': {
    category: 'defi',
    coingeckoId: 'yield-yak',
  },
  // QI
  '0x8729438eb15e2c8b576fcc6aecda6a148776c0f5': {
    category: 'defi',
    coingeckoId: 'benqi',
  },

  // ===== LIQUID STAKING =====
  // sAVAX
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': {
    category: 'liquid-staking',
    coingeckoId: 'benqi-liquid-staked-avax',
  },
  // STAVAX (Hypha Staked AVAX, formerly ggAVAX)
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': {
    category: 'liquid-staking',
    coingeckoId: 'gogopool-ggavax',
    symbolOverride: 'STAVAX',
    nameOverride: 'Hypha Staked AVAX',
  },

  // ===== MEME =====
  // COQ
  '0x420fca0121dc28039145009570975747295f2329': {
    category: 'meme',
    coingeckoId: 'coq-inu',
  },
  // TECH
  '0x2f0e44f51a0c0ce42c0dc7dc9c21a0e9c17e31f4': {
    category: 'meme',
    coingeckoId: 'tech-2',
  },

  // ===== GAMING =====
  // BEAM
  '0x62d0a8458ed7719fdaf978fe5929c6d342b0bfce': {
    category: 'gaming',
    coingeckoId: 'beam-2',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/32417/small/cgicon.png',
  },
  // SHRAP
  '0xd402298a793948698b9a63311404fbbee944eafd': {
    category: 'gaming',
    coingeckoId: 'shrapnel-2',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/32793/small/shrapnel.png',
  },
  // GUN
  '0x26debd39d5ed069770406fca10a0e4f8d2c743eb': {
    category: 'gaming',
    coingeckoId: 'gunz',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/55027/small/gunz.jpg',
  },
  // NXPC (Nexpace / MapleStory Universe)
  '0x5e0e90e268bc247cc850c789a0db0d5c7621fb59': {
    category: 'gaming',
    coingeckoId: 'nexpace',
    nameOverride: 'Nexpace',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/55703/small/wk63iOZz_400x400.png',
  },

  // ===== RWA (Real World Assets) =====
  // XAUT0 (Tether Gold - Omnichain)
  '0x2775d5105276781b4b85ba6ea6a6653beed1dd32': {
    category: 'rwa',
    coingeckoId: 'tether-gold-tokens',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/66560/small/XAUt0_Token_Icon_Gold.png',
    nameOverride: 'Tether Gold',
    symbolOverride: 'XAUt0',
  },
  // BUIDL (BlackRock USD Institutional Digital Liquidity Fund)
  '0x53fc82f14f009009b440a706e31c9021e1196a2f': {
    category: 'rwa',
    coingeckoId: 'blackrock-usd-institutional-digital-liquidity-fund',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/36291/small/blackrock.png',
    nameOverride: 'BlackRock BUIDL',
    symbolOverride: 'BUIDL',
    restricted: true,
  },
  // ACRED (Apollo Diversified Credit Securitize Fund)
  '0x7c64925002bfa705834b118a923e9911bee32875': {
    category: 'rwa',
    coingeckoId: 'apollo-diversified-credit-securitize-fund',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/54809/small/ACRED.png',
    nameOverride: 'Apollo Credit Fund',
    symbolOverride: 'ACRED',
    restricted: true,
  },
  // VBILL (VanEck Treasury Fund)
  '0x7f4546ef315efc65336187fe3765ea779ac90183': {
    category: 'rwa',
    coingeckoId: 'vaneck-treasury-fund',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/56023/small/vbill_200.png',
    nameOverride: 'VanEck Treasury Fund',
    symbolOverride: 'VBILL',
    restricted: true,
  },
  // JAAA (Janus Henderson Anemoy AAA CLO Fund)
  '0x58f93d6b1ef2f44ec379cb975657c132cbed3b6b': {
    category: 'rwa',
    coingeckoId: 'janus-henderson-anemoy-aaa-clo-fund',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/70446/small/jaaa.png',
    nameOverride: 'JH Anemoy AAA CLO',
    symbolOverride: 'JAAA',
    restricted: true,
  },
  // JTRSY (Janus Henderson Anemoy Treasury Fund)
  '0xa5d465251fbcc907f5dd6bb2145488dfc6a2627b': {
    category: 'rwa',
    coingeckoId: 'janus-henderson-anemoy-treasury-fund',
    logoUrl: 'https://coin-images.coingecko.com/coins/images/70445/small/JTRSY.png',
    nameOverride: 'JH Anemoy Treasury',
    symbolOverride: 'JTRSY',
    restricted: true,
  },
};

// Build token list from tokenlist.json + LISTED_TOKENS config
const AVALANCHE_CHAIN_ID = 43114;

// Create a map of tokenlist.json tokens by address (Avalanche only)
const tokenlistMap = new Map<string, { name: string; symbol: string; decimals: number }>();
for (const token of tokenlist) {
  if (token.chainId === AVALANCHE_CHAIN_ID) {
    tokenlistMap.set(token.address.toLowerCase(), {
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    });
  }
}

// Checksummed addresses for logo URLs (Trader Joe uses mixed-case addresses)
const LOGO_ADDRESSES: Record<string, string> = {
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
  '0x152b9d0fdc40c096757f570a51e494bd4b943e50': '0x152b9d0FdC40C096757F570A51E494bd4b943E50', // BTC.b
  '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', // WETH.e
  '0x5947bb275c521040051d82396192181b413227a3': '0x5947BB275c521040051D82396192181b413227A3', // LINK.e
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC
  '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7': '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT
  '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664', // USDC.e
  '0xd586e7f844cea2f87f50152665bcbc2c279d8d70': '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', // DAI.e
  '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd': '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', // JOE
  '0x62edc0692bd897d2295872a9ffcac5425011c661': '0x62edc0692BD897D2295872a9FFCac5425011c661', // GMX
  '0x63a72806098bd3d9520cc43356dd78afe5d386d9': '0x63a72806098Bd3D9520cC43356dD78afe5D386D9', // AAVE.e
  '0x60781c2586d68229fde47564546784ab3faca982': '0x60781C2586D68229fde47564546784ab3fACA982', // PNG
  '0x59414b3089ce2af0010e7523dea7e2b35d776ec7': '0x59414b3089ce2AF0010e7523Dea7E2b35d776ec7', // YAK
  '0x8729438eb15e2c8b576fcc6aecda6a148776c0f5': '0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5', // QI
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE', // sAVAX
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3', // STAVAX
  '0x420fca0121dc28039145009570975747295f2329': '0x420FcA0121DC28039145009570975747295f2329', // COQ
  '0x2f0e44f51a0c0ce42c0dc7dc9c21a0e9c17e31f4': '0x2f0e44F51a0C0cE42C0DC7dC9C21A0e9c17E31F4', // TECH
};

// Generate logo URL from address
function getLogoUrl(address: string): string {
  const checksummed = LOGO_ADDRESSES[address.toLowerCase()] || address;
  return `https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/${checksummed}/logo.png`;
}

// Build the final MARKETS_TOKENS array
export const MARKETS_TOKENS: MarketToken[] = Object.entries(LISTED_TOKENS).map(([address, config]) => {
  const tokenInfo = tokenlistMap.get(address);

  // For native AVAX or tokens not in tokenlist, use overrides
  const symbol = config.symbolOverride || tokenInfo?.symbol || 'UNKNOWN';
  const name = config.nameOverride || tokenInfo?.name || 'Unknown Token';
  const decimals = tokenInfo?.decimals ?? 18;

  return {
    symbol,
    name,
    coingeckoId: config.coingeckoId,
    category: config.category,
    address: address.startsWith('0x') ? address : `0x${address}`,
    decimals,
    logoUrl: config.logoUrl || getLogoUrl(address),
    ...(config.restricted && { restricted: true }),
  };
});

// Helper functions
export function getTokensByCategory(category: TokenCategory): MarketToken[] {
  return MARKETS_TOKENS.filter(t => t.category === category);
}

export function getAllCoingeckoIds(): string[] {
  return MARKETS_TOKENS.map(t => t.coingeckoId);
}

export function getTokenByAddress(address: string): MarketToken | undefined {
  return MARKETS_TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase());
}
