// Known addresses on Avalanche (exchanges, bridges, protocols, tokens)

export interface KnownAddress {
  name: string;
  type: 'exchange' | 'bridge' | 'protocol' | 'token';
}

// Known addresses (exchanges, bridges, etc.)
export const KNOWN_ADDRESSES: Record<string, KnownAddress> = {
  // Exchanges
  '0x6d8be5cdf0d7dee1f04e25fd70b001ae3b907824': { name: 'Binance', type: 'exchange' },
  '0x9f8c163cba728e99993abe7495f06c0a3c8ac8b9': { name: 'Binance 2', type: 'exchange' },
  '0xe2d3a739effcd3a99387d015e260eefac72ebea1': { name: 'Coinbase', type: 'exchange' },
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': { name: 'Coinbase 2', type: 'exchange' },
  '0x4aefa39caeadd662ae31ab0ce7c8c2c9c0a013e8': { name: 'OKX', type: 'exchange' },
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': { name: 'Bybit', type: 'exchange' },
  '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2': { name: 'FTX', type: 'exchange' },
  // Bridges
  '0x8eb8a3b98659cce290402893d0123abb75e3ab28': { name: 'Avalanche Bridge', type: 'bridge' },
  '0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0': { name: 'LayerZero', type: 'bridge' },
  // Protocols (DEX routers)
  '0xc4729e56b831d74bbc18797e0e17a295fa77488c': { name: 'Yield Yak', type: 'protocol' },
  '0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30': { name: 'Trader Joe', type: 'protocol' },
  '0xe3ffc583dc176575eea7fd9df2a7c65f7e23f4c3': { name: 'Trader Joe', type: 'protocol' },
  '0x60ae616a2155ee3d9a68541ba4544862310933d4': { name: 'Trader Joe', type: 'protocol' },
  '0xe54ca86531e17ef3616d22ca28b0d458b6c89106': { name: 'Pangolin', type: 'protocol' },
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506': { name: 'SushiSwap', type: 'protocol' },
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': { name: 'ParaSwap', type: 'protocol' },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { name: '1inch', type: 'protocol' },
  '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be': { name: 'BENQI', type: 'protocol' },
  '0xa25eaf2906fa1a3a13edac9b9657108af7b703e3': { name: 'GoGoPool', type: 'protocol' },
  '0x5f719c2f1095f7b9fc68a68e35b51194f4b6abe8': { name: 'GMX', type: 'protocol' },
  '0x45a01e4e04f14f7a4a6702c74187c5f6222033cd': { name: 'Stargate', type: 'protocol' },
  '0x18556da13313f3532c54711497a8fedac273220e': { name: 'LFJ', type: 'protocol' },
  // Tokens
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': { name: 'USDC', type: 'token' },
  '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7': { name: 'USDT', type: 'token' },
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': { name: 'WAVAX', type: 'token' },
  '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': { name: 'WETH.e', type: 'token' },
  '0x152b9d0fdc40c096757f570a51e494bd4b943e50': { name: 'BTC.b', type: 'token' },
  '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd': { name: 'JOE', type: 'token' },
  '0x420fca0121dc28039145009570975747295f2329': { name: 'COQ', type: 'token' },
  '0xd586e7f844cea2f87f50152665bcbc2c279d8d70': { name: 'DAI.e', type: 'token' },
  '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': { name: 'USDC.e', type: 'token' },
  '0x50b7545627a5162f82a992c33b87adc75187b218': { name: 'WBTC.e', type: 'token' },
  '0xc7198437980c041c805a1edcba50c1ce5db95118': { name: 'USDT.e', type: 'token' },
  '0x5947bb275c521040051d82396192181b413227a3': { name: 'LINK.e', type: 'token' },
  '0x63a72806098bd3d9520cc43356dd78afe5d386d9': { name: 'AAVE.e', type: 'token' },
};

// Helper functions
export function getAddressInfo(address: string | null | undefined): KnownAddress | null {
  if (!address) return null;
  return KNOWN_ADDRESSES[address.toLowerCase()] || null;
}

export function getAddressName(address: string | null | undefined): string | null {
  const info = getAddressInfo(address);
  return info?.name || null;
}

export function getAddressType(address: string | null | undefined): string | null {
  const info = getAddressInfo(address);
  return info?.type || null;
}

export function isProtocol(address: string | null | undefined): boolean {
  return getAddressType(address) === 'protocol';
}

export function isToken(address: string | null | undefined): boolean {
  return getAddressType(address) === 'token';
}

export function isExchange(address: string | null | undefined): boolean {
  return getAddressType(address) === 'exchange';
}

export function isBridge(address: string | null | undefined): boolean {
  return getAddressType(address) === 'bridge';
}
