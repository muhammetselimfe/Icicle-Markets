// GeckoTerminal on-chain DEX data (free, keyless). Avalanche network id = "avax".
const GT_BASE = 'https://api.geckoterminal.com/api/v2';

// Native AVAX isn't an ERC-20, so DEX pools are indexed under WAVAX instead.
const NATIVE_AVAX = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const WAVAX = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

export interface OnchainPool {
  name: string;          // e.g. "WAVAX / USDC"
  address: string;       // pool address
  dex: string;           // dex identifier (e.g. "trader-joe-v2")
  liquidityUsd: number;  // reserve_in_usd
  volume24hUsd: number;
  trades24h: number;     // buys + sells
  wallets24h: number;    // buyers + sellers
  priceChange24h: number;
}

// Top liquidity pools for a token on a given network.
export async function getTokenPools(address: string, network = 'avax'): Promise<OnchainPool[]> {
  const addr = address.toLowerCase() === NATIVE_AVAX ? WAVAX : address;
  const res = await fetch(`${GT_BASE}/networks/${network}/tokens/${addr}/pools?page=1`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GeckoTerminal error: ${res.status}`);
  const json = await res.json();

  return (json.data ?? []).map((p: any): OnchainPool => {
    const a = p.attributes ?? {};
    const tx = a.transactions?.h24 ?? {};
    return {
      name: a.name ?? '—',
      address: a.address ?? '',
      dex: p.relationships?.dex?.data?.id ?? '',
      liquidityUsd: Number(a.reserve_in_usd ?? 0),
      volume24hUsd: Number(a.volume_usd?.h24 ?? 0),
      trades24h: Number(tx.buys ?? 0) + Number(tx.sells ?? 0),
      wallets24h: Number(tx.buyers ?? 0) + Number(tx.sellers ?? 0),
      priceChange24h: Number(a.price_change_percentage?.h24 ?? 0),
    };
  });
}
