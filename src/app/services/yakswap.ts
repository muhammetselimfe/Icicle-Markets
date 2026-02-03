import type { PublicClient } from 'viem';
import { YAK_ROUTER_ADDRESS, YAK_ROUTER_ABI } from '@/app/config/yakswap-abi';

// Native AVAX uses WAVAX address for routing
export const WAVAX_ADDRESS = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' as const;
export const NATIVE_AVAX = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

export interface YakQuote {
  amounts: bigint[];
  adapters: `0x${string}`[];
  path: `0x${string}`[];
  gasEstimate: bigint;
}

export interface YakQuoteParams {
  amountIn: bigint;
  tokenIn: string;
  tokenOut: string;
  maxSteps?: number;
  gasPrice?: bigint;
}

// Check if token is native AVAX
export function isNativeAvax(address: string): boolean {
  return address.toLowerCase() === NATIVE_AVAX.toLowerCase();
}

// Get the address to use for routing (WAVAX for native AVAX)
export function getRoutingAddress(address: string): `0x${string}` {
  if (isNativeAvax(address)) {
    return WAVAX_ADDRESS;
  }
  return address as `0x${string}`;
}

// Validate that a path doesn't have consecutive duplicate tokens
function isValidPath(path: readonly `0x${string}`[]): boolean {
  if (path.length < 2) return false;

  // Check for consecutive duplicates (same token twice in a row)
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i].toLowerCase() === path[i + 1].toLowerCase()) {
      return false;
    }
  }

  // Check that start and end are different
  if (path[0].toLowerCase() === path[path.length - 1].toLowerCase()) {
    return false;
  }

  return true;
}

// Fetch quote from Yak Router contract
export async function getQuote(
  client: PublicClient,
  params: YakQuoteParams
): Promise<YakQuote | null> {
  const { amountIn, tokenIn, tokenOut, maxSteps = 3, gasPrice } = params;

  // Use WAVAX address for routing when dealing with native AVAX
  const routingTokenIn = getRoutingAddress(tokenIn);
  const routingTokenOut = getRoutingAddress(tokenOut);

  // Get current gas price if not provided
  const currentGasPrice = gasPrice ?? (await client.getGasPrice());

  try {
    const result = await client.readContract({
      address: YAK_ROUTER_ADDRESS,
      abi: YAK_ROUTER_ABI,
      functionName: 'findBestPathWithGas',
      args: [amountIn, routingTokenIn, routingTokenOut, BigInt(maxSteps), currentGasPrice],
    });

    // Check if valid path was found (amounts array should have values)
    if (!result.amounts || result.amounts.length === 0 || result.amounts[result.amounts.length - 1] === 0n) {
      return null;
    }

    const path = result.path as `0x${string}`[];

    // Validate the path doesn't have nonsensical back-and-forth swaps
    if (!isValidPath(path)) {
      console.warn('Invalid path detected (back-and-forth swaps), rejecting quote');
      return null;
    }

    return {
      amounts: result.amounts as bigint[],
      adapters: result.adapters as `0x${string}`[],
      path: path,
      gasEstimate: result.gasEstimate as bigint,
    };
  } catch (error) {
    console.error('Yak quote error:', error);
    return null;
  }
}

// Calculate minimum output with slippage
export function calculateMinOutput(amountOut: bigint, slippageBps: number): bigint {
  // slippageBps is in basis points (100 = 1%)
  const slippageFactor = BigInt(10000 - slippageBps);
  return (amountOut * slippageFactor) / BigInt(10000);
}

// Calculate price impact percentage
export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  tokenInDecimals: number,
  tokenOutDecimals: number,
  marketRate?: number
): number {
  if (!marketRate || marketRate === 0) return 0;

  // Normalize amounts to same decimal scale
  const normalizedIn = Number(amountIn) / Math.pow(10, tokenInDecimals);
  const normalizedOut = Number(amountOut) / Math.pow(10, tokenOutDecimals);

  if (normalizedIn === 0) return 0;

  const executionRate = normalizedOut / normalizedIn;
  const impact = ((marketRate - executionRate) / marketRate) * 100;

  return Math.max(0, impact);
}

// Build trade struct for swap
export interface Trade {
  amountIn: bigint;
  amountOut: bigint;
  path: `0x${string}`[];
  adapters: `0x${string}`[];
}

export function buildTrade(quote: YakQuote, slippageBps: number): Trade {
  const amountIn = quote.amounts[0];
  const amountOut = quote.amounts[quote.amounts.length - 1];
  const minAmountOut = calculateMinOutput(amountOut, slippageBps);

  return {
    amountIn,
    amountOut: minAmountOut,
    path: quote.path,
    adapters: quote.adapters,
  };
}

// Determine which swap function to use
export type SwapType = 'swapNoSplit' | 'swapNoSplitFromAVAX' | 'swapNoSplitToAVAX';

export function getSwapType(tokenIn: string, tokenOut: string): SwapType {
  const isFromNative = isNativeAvax(tokenIn);
  const isToNative = isNativeAvax(tokenOut);

  if (isFromNative) {
    return 'swapNoSplitFromAVAX';
  } else if (isToNative) {
    return 'swapNoSplitToAVAX';
  }
  return 'swapNoSplit';
}

// Known Yak Swap adapter addresses to protocol names
// From: https://github.com/yieldyak/yak-aggregator/blob/master/deployments/AvalancheDeployments.sol
const ADAPTER_NAMES: Record<string, string> = {
  // Trader Joe
  '0xdb66686ac8bea67400cf9e5dd6c8849575b90148': 'Trader Joe',
  // Trader Joe LB (Liquidity Book) V2
  '0xe7632926806e9513708232bcda8f70356646750c': 'Trader Joe LB',
  // Trader Joe LB V2.2
  '0xf9f824576f06ff92765f2af700a5a9923526261e': 'Trader Joe LB',
  // Pangolin
  '0x3614657edc3cb90ba420e5f4f61679777e4974e3': 'Pangolin',
  // Pangolin V3
  '0x526c75aef80d3c5d19f1b9fc38e3f7ef591eaaa2': 'Pangolin V3',
  // SushiSwap
  '0x3f314530a4964acca1f20dad2d35275c23ed7f5d': 'SushiSwap',
  // Pharaoh
  '0x97d26d7fc0895e3456b2146585848b466cfbb1cf': 'Pharaoh',
  '0x564c35a1647ed40850325ebf23e484bb56e75ab2': 'Pharaoh Legacy',
  '0xaddb698a6723787624f3286369e588de7d780927': 'Pharaoh CL',
  '0x20a8a786375e9a92b875add32a7280a32820682c': 'Pharaoh Legacy',
  // Synapse
  '0xafb5ae9934266a131f44f2a80c783d6a827a3d1a': 'Synapse',
  // Curve
  '0xd0f6e66113a6d6cca238371948f4ce2893d62881': 'Curve',
  '0x22c62c9e409b97f1f9caa5ca5433074914d73c3e': 'Curve',
  '0x3eea1f1ffca00c69ba5a99e362d9a7d4e3902b3c': 'Curve',
  // Uniswap V3
  '0x29deccd2f4fdb046d24585d01b1dcdfb902acacd': 'Uniswap V3',
  // Uniswap V4
  '0x030b6d2b19a834535987f20ca2958039b572694c': 'Uniswap V4',
  // WooFi
  '0x4efb1880dc9b01c833a6e2824c8eadea83e428b0': 'WooFi',
  // sAVAX (Benqi staked AVAX)
  '0x2f6ca0a98cf8f7d407e98993fd576f70f0faa80b': 'BENQI sAVAX',
  // ggAVAX (GoGoPool)
  '0x79632b8194a1ce048e5d9b0e282e9ee2d4579c20': 'GoGoPool',
  // WAVAX wrapper
  '0x5c4d23fd18fc4128f77426f42237acfce618d0b1': 'WAVAX Wrap',
  // Wombat
  '0x7de32c76309aeb1025cba3384cabe36326603046': 'Wombat',
  // Token Mill
  '0x214617987145ef7c5462870362fdcae9cacdf3c8': 'Token Mill',
  // Arena
  '0xdfd22ef6d509a982f4e6883cbf00d56d5d0d87f3': 'Arena',
  '0xef3ccefb2fe23e9d0aa7b578724b92f59f76f13c': 'Arena V2',
  // Blackhole
  '0x123577a1560004d4432dc5e31f97363d0cd8a651': 'Blackhole',
  '0xe3d2c10c2122e6f02c702064015554d468b24d6d': 'Blackhole CL',
  // Apex
  '0xa2b61cd3e656e22a41a290092ebe9a2f81ed39c5': 'Apex',
};

// Get protocol name from adapter address
export function getAdapterName(adapterAddress: string): string {
  const normalized = adapterAddress.toLowerCase();
  return ADAPTER_NAMES[normalized] || 'DEX';
}

// Format amount for display
export function formatAmount(amount: bigint, decimals: number, maxDecimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.slice(0, maxDecimals).replace(/0+$/, '');

  if (trimmedFractional) {
    return `${integerPart}.${trimmedFractional}`;
  }
  return integerPart.toString();
}

// Parse amount from string input
export function parseAmount(value: string, decimals: number): bigint {
  if (!value || value === '') return 0n;

  const parts = value.split('.');
  const integerPart = parts[0] || '0';
  const fractionalPart = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');

  return BigInt(integerPart + fractionalPart);
}
