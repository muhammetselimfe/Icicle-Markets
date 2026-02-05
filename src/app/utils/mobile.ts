/**
 * Mobile detection and wallet deep linking utilities
 */

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

// Deep link URLs for wallet apps
export const WALLET_DEEP_LINKS = {
  metamask: {
    universal: 'https://metamask.app.link/dapp/',
  },
  core: {
    universal: 'https://core.app/browse?url=',
  },
  coinbase: {
    universal: 'https://go.cb-w.com/dapp?cb_url=',
  },
  rabby: {
    universal: 'https://rabby.io/dapp?url=',
  },
} as const;

/**
 * Generate a deep link URL for a specific wallet
 */
export function getWalletDeepLink(wallet: keyof typeof WALLET_DEEP_LINKS): string {
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const link = WALLET_DEEP_LINKS[wallet];
  return `${link.universal}${encodeURIComponent(currentUrl)}`;
}
