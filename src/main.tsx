import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from 'next-themes';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/app/config/wagmi';
import App from "./app/App.tsx";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
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
        embeddedWallets: { createOnLogin: 'users-without-wallets' },
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
