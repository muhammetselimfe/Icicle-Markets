export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  logoUrl?: string;
}

export type SwapStep =
  | 'idle'
  | 'quoting'
  | 'approving'
  | 'swapping'
  | 'success'
  | 'error';

export interface SwapState {
  fromToken: SwapToken | null;
  toToken: SwapToken | null;
  fromAmount: string;
  toAmount: string;
  slippage: number;
  step: SwapStep;
  error: string | null;
  txHash: string | null;
}

export interface TesseractQuote {
  amountOut: string;
  amountOutMin: string;
  priceImpact: number;
  route: TesseractRouteStep[];
  gasEstimate: string;
  txParams?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
}

export interface TesseractRouteStep {
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
}

export interface TesseractQuoteRequest {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  accountAddress?: string;
}

export interface TesseractQuoteResponse {
  quotes: TesseractQuote[];
  bestQuoteIndex: number;
}

export const SLIPPAGE_OPTIONS = [
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
  { label: '3%', value: 300 },
] as const;

export const MIN_SLIPPAGE = 10; // 0.1%
export const MAX_SLIPPAGE = 1000; // 10%
export const DEFAULT_SLIPPAGE = 100; // 1%
