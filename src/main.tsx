import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from 'next-themes';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { avalanche } from 'wagmi/chains';
import { config, fujiChain } from '@/app/config/wagmi';
import { CoinGeckoRateLimitError } from '@/app/services/coingecko';
import App from "./app/App.tsx";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A rate-limited CoinGecko call gets exactly one retry, after the hold-off it reports;
      // retrying sooner only burns more of the per-minute budget.
      retry: (failureCount, error) =>
        failureCount < (error instanceof CoinGeckoRateLimitError ? 1 : 2),
      retryDelay: (attempt, error) =>
        error instanceof CoinGeckoRateLimitError
          ? error.retryAfterMs + 500
          : Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        appearance: {
          theme: isLight ? 'light' : 'dark',
          accentColor: isLight ? '#0284c7' : '#8be4ff',
          walletList: ['metamask', 'coinbase_wallet', 'wallet_connect'],
        },
        loginMethods: ['wallet', 'email', 'google', 'twitter', 'github'],
        // Privy v3 nests this under `ethereum`; the old top-level key is silently ignored.
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        // Fuji with the publicnode RPC first: the official endpoint rate-limits per IP.
        supportedChains: [avalanche, fujiChain],
        defaultChain: fujiChain,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <App />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange storageKey="icicle-theme">
    <Root />
  </ThemeProvider>
);
