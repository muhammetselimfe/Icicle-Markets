// Centralized query key factory for React Query
export const queryKeys = {
  chainStats: (chainId: number) => ['chainStats', chainId] as const,
  timeSeries: (metric: string, granularity: string, limit: number) =>
    ['timeSeries', metric, granularity, limit] as const,
  validators: (activeOnly: boolean, subnetId: string) =>
    ['validators', activeOnly, subnetId] as const,
  tokenPrices: (limit: number) => ['tokenPrices', limit] as const,
  avaxPrice: () => ['avaxPrice'] as const,
  assetChart: (coingeckoId: string, days: number) => ['assetChart', coingeckoId, days] as const,
  marketTokens: () => ['marketTokens'] as const,
  transactions: (chainId: number, limit: number) =>
    ['transactions', chainId, limit] as const,
  transactionHistory: (address: string) =>
    ['transactionHistory', address] as const,
  portfolio: (address: string) => ['portfolio', address] as const,
  swapQuote: (tokenIn: string, tokenOut: string, amount: string) =>
    ['swapQuote', tokenIn, tokenOut, amount] as const,
  activeSince: (address: string) => ['activeSince', address] as const,
  optionsMarkets: () => ['optionsMarkets'] as const,
  optionsPositions: (owner: string) => ['optionsPositions', owner] as const,
  optionsOpenCost: (marketId: number, lower: string, upper: string, qty: string) =>
    ['optionsOpenCost', marketId, lower, upper, qty] as const,
  optionsUsdcBalance: (owner: string) => ['optionsUsdcBalance', owner] as const,
  avaxChart: (days: number) => ['avaxChart', days] as const,
  binProbabilities: (marketId: number) => ['binProbabilities', marketId] as const,
  optionsSpendToQty: (marketId: number, lower: string, upper: string, spend: string) =>
    ['optionsSpendToQty', marketId, lower, upper, spend] as const,
};
