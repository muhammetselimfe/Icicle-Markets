import type { SwapToken } from '@/app/types/swap';
import { avalanche } from 'wagmi/chains';
import { MARKETS_TOKENS } from './markets-tokens';

// Convert MarketToken to SwapToken format
export const MAINNET_TOKENS: SwapToken[] = MARKETS_TOKENS.map(t => ({
  symbol: t.symbol,
  name: t.name,
  address: t.address,
  decimals: t.decimals,
  chainId: avalanche.id,
  logoUrl: t.logoUrl,
}));

export function getTokensByChainId(chainId: number): SwapToken[] {
  if (chainId === avalanche.id) {
    return MAINNET_TOKENS;
  }
  return MAINNET_TOKENS;
}

export function getTokenByAddress(chainId: number, address: string): SwapToken | undefined {
  const tokens = getTokensByChainId(chainId);
  return tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function getDefaultFromToken(chainId: number): SwapToken {
  const tokens = getTokensByChainId(chainId);
  return tokens.find(t => t.symbol === 'AVAX') || tokens[0];
}

export function getDefaultToToken(chainId: number): SwapToken {
  const tokens = getTokensByChainId(chainId);
  return tokens.find(t => t.symbol === 'USDC') || tokens[1];
}

// All listed tokens are now swappable (no filtering needed)
export function isTokenListed(_symbol: string): boolean {
  return true;
}
