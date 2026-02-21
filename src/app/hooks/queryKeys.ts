// Centralized query key factory for React Query
export const queryKeys = {
  chainStats: (chainId: number) => ['chainStats', chainId] as const,
  timeSeries: (metric: string, granularity: string, limit: number) =>
    ['timeSeries', metric, granularity, limit] as const,
  validators: (activeOnly: boolean, subnetId: string) =>
    ['validators', activeOnly, subnetId] as const,
  tokenPrices: (limit: number) => ['tokenPrices', limit] as const,
  avaxPrice: () => ['avaxPrice'] as const,
  marketTokens: () => ['marketTokens'] as const,
  transactions: (chainId: number, limit: number) =>
    ['transactions', chainId, limit] as const,
  transactionHistory: (address: string) =>
    ['transactionHistory', address] as const,
  portfolio: (address: string) => ['portfolio', address] as const,
  swapQuote: (tokenIn: string, tokenOut: string, amount: string) =>
    ['swapQuote', tokenIn, tokenOut, amount] as const,
  activeSince: (address: string) => ['activeSince', address] as const,
};
