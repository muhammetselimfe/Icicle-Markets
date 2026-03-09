import { http } from 'wagmi';
import { avalanche, avalancheFuji } from 'wagmi/chains';
import { createConfig } from '@privy-io/wagmi';

export const config = createConfig({
  chains: [avalanche, avalancheFuji],
  transports: {
    [avalanche.id]: http(),
    [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc'),
  },
});

// Chain constants
export const CHAIN_IDS = {
  MAINNET: avalanche.id,
  FUJI: avalancheFuji.id,
} as const;

// Icicle Options contract addresses (Avalanche Fuji)
export const OPTIONS_CONTRACTS = {
  core: '0x5163b4aB77650D1D937a5c5E6B0d012e4659546e' as const,
  position: '0x3FD90718b2aA7D15417d1d494b653c7EF44dff70' as const,
  lpShare: '0xf8Ea96283fA5726fb64f3C57695a333Ce007B56a' as const,
  usdc: '0x12ecFc9715cEA5DAd986F5B59848aEc7044e66E8' as const,
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
