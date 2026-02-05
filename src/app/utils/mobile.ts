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
// Custom URL schemes are more reliable on iOS than universal links
export const WALLET_DEEP_LINKS = {
  metamask: {
    // Custom scheme - more reliable on iOS
    custom: 'metamask://dapp/',
    universal: 'https://metamask.app.link/dapp/',
  },
  core: {
    // Core only has universal link
    universal: 'https://core.app/browse?url=',
  },
  coinbase: {
    // Custom scheme - more reliable on iOS
    custom: 'cbwallet://dapp?url=',
    universal: 'https://go.cb-w.com/dapp?cb_url=',
  },
} as const;

/**
 * Generate a deep link URL for a specific wallet
 * Uses custom URL schemes where available (more reliable on iOS)
 */
export function getWalletDeepLink(wallet: keyof typeof WALLET_DEEP_LINKS): string {
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const link = WALLET_DEEP_LINKS[wallet];

  // MetaMask uses unencoded URL after dapp/
  if (wallet === 'metamask') {
    return `${link.custom}${currentUrl}`;
  }

  // Others use encoded URL
  const encodedUrl = encodeURIComponent(currentUrl);

  // Use custom scheme if available, otherwise universal link
  if ('custom' in link && link.custom) {
    return `${link.custom}${encodedUrl}`;
  }

  return `${link.universal}${encodedUrl}`;
}
