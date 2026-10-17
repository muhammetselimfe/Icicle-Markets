import { fallback, http } from 'wagmi';
import { avalanche, avalancheFuji } from 'wagmi/chains';
import { createConfig } from '@privy-io/wagmi';

// Fuji reads: the official endpoint rate-limits per IP (shared with the keeper/bots on the
// same network), so prefer publicnode and fall back to the official RPC on failure.
const FUJI_RPCS = [
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://api.avax-test.network/ext/bc/C/rpc',
];

// Same chain with the RPC list above baked in, so the Privy embedded wallet (which
// broadcasts through the chain's default RPC, not the wagmi transport) uses it too.
export const fujiChain = {
  ...avalancheFuji,
  rpcUrls: {
    ...avalancheFuji.rpcUrls,
    default: { http: FUJI_RPCS },
  },
} as const;

export const config = createConfig({
  chains: [avalanche, fujiChain],
  transports: {
    [avalanche.id]: http(),
    [fujiChain.id]: fallback(FUJI_RPCS.map((url) => http(url, { retryCount: 2 }))),
  },
});

// Chain constants
export const CHAIN_IDS = {
  MAINNET: avalanche.id,
  FUJI: avalancheFuji.id,
} as const;

// Icicle Options contract addresses (Avalanche Fuji)
// v2 dynamic-pricing deployment (Fuji), 15-min batches. Redeployed 2026-06-23.
export const OPTIONS_CONTRACTS = {
  core: '0x516F1301b7546220a5c575d21B8D34A35210E646' as const,
  position: '0x795b7E5Adddd23FDD97B71980fe8C667F6Ee76Ce' as const,
  lpShare: '0xcde46B5A9dc0233097Dd1Fb296086d42928656d1' as const,
  usdc: '0x199F29b8ef9ff78978325045373aB9eFCf3FE871' as const,
} as const;

// Native token addresses
export const NATIVE_TOKEN = {
  [avalanche.id]: {
    symbol: 'AVAX',
    decimals: 18,
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const,
  },
} as const;

// Wrapped native token addresses
export const WRAPPED_NATIVE = {
  [avalanche.id]: {
    symbol: 'WAVAX',
    decimals: 18,
    address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' as const,
  },
} as const;

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
