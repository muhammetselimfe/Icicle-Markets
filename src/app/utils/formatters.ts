// Data formatting utilities for Icicle Markets

// Format address for display (0x1234...5678)
export function formatAddress(address: string, prefixLen = 6, suffixLen = 4): string {
  if (!address) return '';
  if (address.length <= prefixLen + suffixLen + 3) return address;
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}

// Format transaction hash
export function formatTxHash(hash: string): string {
  return formatAddress(hash, 10, 6);
}

// Format wei to AVAX (1 AVAX = 10^18 wei)
export function formatWei(wei: string | number, decimals = 4): string {
  const weiNum = typeof wei === 'string' ? BigInt(wei) : BigInt(Math.floor(wei));
  const avax = Number(weiNum) / 1e18;

  if (avax === 0) return '0 AVAX';
  if (avax < 0.0001) return '<0.0001 AVAX';

  return `${avax.toFixed(decimals)} AVAX`;
}

// Format nAVAX to AVAX (1 AVAX = 10^9 nAVAX)
export function formatNanoAvax(nAvax: number, decimals = 4): string {
  const avax = nAvax / 1e9;

  if (avax === 0) return '0 AVAX';
  if (avax < 0.0001) return '<0.0001 AVAX';

  return `${avax.toFixed(decimals)} AVAX`;
}

// Format number with commas (1234567 -> 1,234,567)
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// Format large numbers (38946445 -> 38.9M)
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

// Format USD currency
export function formatUSD(amount: number, decimals = 2): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`;
  }
  return `$${amount.toFixed(decimals)}`;
}

// Format price (supports very small and large values)
export function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price < 0.0001) return `$${price.toExponential(2)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 100) return `$${price.toFixed(2)}`;
  return `$${formatNumber(Math.round(price * 100) / 100)}`;
}

// Format percentage change with sign
export function formatPercentage(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// Format gas (in gwei)
export function formatGas(gasUsed: number): string {
  if (gasUsed >= 1_000_000) {
    return `${(gasUsed / 1_000_000).toFixed(1)}M`;
  }
  if (gasUsed >= 1_000) {
    return `${(gasUsed / 1_000).toFixed(1)}K`;
  }
  return gasUsed.toString();
}

// Format gas price (base_fee_per_gas from wei to nAVAX)
export function formatGasPrice(baseFeePerGas: number): string {
  // Convert from wei to nAVAX (gwei equivalent)
  const nAvax = baseFeePerGas / 1e9;
  return `${nAvax.toFixed(0)} nAVAX`;
}

// Format block time (seconds to human readable)
export function formatBlockTime(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

// Format TPS
export function formatTPS(tps: number): string {
  if (tps >= 1000) {
    return `${(tps / 1000).toFixed(1)}K`;
  }
  return tps.toFixed(0);
}

// Determine if a change is positive, negative, or neutral
export function getChangeType(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

// Get color class based on change type
export function getChangeColor(value: number): string {
  const type = getChangeType(value);
  switch (type) {
    case 'positive':
      return '#4dff88'; // neon-green
    case 'negative':
      return '#ff4d4d'; // neon-red
    default:
      return '#8be4ff'; // ice-blue
  }
}

// Get arrow based on change
export function getChangeArrow(value: number): string {
  if (value > 0) return '↑';
  if (value < 0) return '↓';
  return '';
}
