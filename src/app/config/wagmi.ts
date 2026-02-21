import { http, createConfig } from 'wagmi';
import { avalanche } from 'wagmi/chains';
import { walletConnect, metaMask, coinbaseWallet } from 'wagmi/connectors';

// WalletConnect project ID - users should replace with their own
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

export const config = createConfig({
  chains: [avalanche],
  connectors: [
    metaMask({
      dappMetadata: {
        name: 'Icicle Markets',
        url: 'https://iciclemarkets.com',
        iconUrl: 'https://iciclemarkets.com/logo-icon.svg',
      },
    }),
    coinbaseWallet({
      appName: 'Icicle Markets',
      appLogoUrl: 'https://iciclemarkets.com/logo-icon.svg',
    }),
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Icicle Markets',
        description: 'Modern blockchain explorer for Avalanche',
        url: 'https://iciclemarkets.com',
        icons: ['https://iciclemarkets.com/logo-icon.svg'],
      },
      showQrModal: true,
    }),
  ],
  transports: {
    [avalanche.id]: http(),
  },
});

// Chain constants
export const CHAIN_IDS = {
  MAINNET: avalanche.id,
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
