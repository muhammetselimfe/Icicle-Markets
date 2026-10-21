import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Same-origin CoinGecko path, used when VITE_COINGECKO_BASE=/api/coingecko. Vite forwards it
// upstream for dev/preview; on Netlify the function in netlify/functions/coingecko.mts serves
// it from the CDN cache.
const coingeckoProxy = {
  '/api/coingecko': {
    target: 'https://api.coingecko.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api\/coingecko/, '/api/v3'),
  },
}

export default defineConfig({
  clearScreen: false,
  server: { proxy: coingeckoProxy },
  preview: { proxy: coingeckoProxy },
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo-icon.svg'],
      manifest: {
        name: 'Icicle Markets',
        short_name: 'Icicle',
        description: 'Avalanche Blockchain Explorer & Marketplace',
        theme_color: '#0a0e27',
        background_color: '#0a0e27',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — Privy adds ~2.7 MB bundle
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(api\.coingecko\.com|glacier-api\.avax\.network|avalanche--mainnet)|\/api\/coingecko\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Vendor code changes far less often than app code; splitting it by package lets the
    // browser keep Privy / wagmi / React cached across app deploys.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/@privy-io/')) return 'vendor-privy';
          if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-')) return 'vendor-charts';
          if (id.includes('/wagmi/') || id.includes('/@wagmi/') || id.includes('/viem/') || id.includes('/ox/') || id.includes('/abitype/')) return 'vendor-web3';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/') || id.includes('/@tanstack/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      '@privy-io/react-auth',
      '@privy-io/wagmi',
      'viem',
      'viem/chains',
      'viem/accounts',
      'viem/actions',
      'viem/utils',
      'recharts',
      'lucide-react',
      'sonner',
      'motion',
      'clsx',
      'tailwind-merge',
      'next-themes',
    ],
  },
})
