import { describe, it, expect } from 'vitest';
import {
  isNativeAvax,
  getRoutingAddress,
  parseAmount,
  formatAmount,
  calculateMinOutput,
  calculatePriceImpact,
  buildTrade,
  getSwapType,
  getAdapterName,
  WAVAX_ADDRESS,
  NATIVE_AVAX,
  type YakQuote,
} from '../yakswap';

describe('isNativeAvax', () => {
  it('returns true for native AVAX address', () => {
    expect(isNativeAvax(NATIVE_AVAX)).toBe(true);
  });

  it('returns true regardless of case', () => {
    expect(isNativeAvax('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe(true);
  });

  it('returns false for other addresses', () => {
    expect(isNativeAvax('0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7')).toBe(false);
  });
});

describe('getRoutingAddress', () => {
  it('returns WAVAX for native AVAX', () => {
    expect(getRoutingAddress(NATIVE_AVAX)).toBe(WAVAX_ADDRESS);
  });

  it('returns the same address for non-native tokens', () => {
    const usdc = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
    expect(getRoutingAddress(usdc)).toBe(usdc);
  });
});

describe('parseAmount', () => {
  it('parses integer amounts', () => {
    expect(parseAmount('1', 18)).toBe(BigInt('1000000000000000000'));
  });

  it('parses decimal amounts', () => {
    expect(parseAmount('1.5', 18)).toBe(BigInt('1500000000000000000'));
  });

  it('parses with 6 decimals (USDC)', () => {
    expect(parseAmount('100', 6)).toBe(BigInt('100000000'));
  });

  it('parses decimal with 6 decimals', () => {
    expect(parseAmount('1.23', 6)).toBe(BigInt('1230000'));
  });

  it('returns 0 for empty string', () => {
    expect(parseAmount('', 18)).toBe(0n);
  });

  it('truncates excess decimals', () => {
    expect(parseAmount('1.1234567', 6)).toBe(BigInt('1123456'));
  });
});

describe('formatAmount', () => {
  it('formats whole number amounts', () => {
    expect(formatAmount(BigInt('1000000000000000000'), 18)).toBe('1');
  });

  it('formats fractional amounts', () => {
    expect(formatAmount(BigInt('1500000000000000000'), 18)).toBe('1.5');
  });

  it('formats USDC amounts (6 decimals)', () => {
    expect(formatAmount(BigInt('1230000'), 6)).toBe('1.23');
  });

  it('respects maxDecimals', () => {
    expect(formatAmount(BigInt('1234567890123456789'), 18, 4)).toBe('1.2345');
  });

  it('strips trailing zeros', () => {
    expect(formatAmount(BigInt('1000000'), 6)).toBe('1');
  });
});

describe('calculateMinOutput', () => {
  it('calculates with 1% slippage (100 bps)', () => {
    const amount = BigInt('1000000000000000000'); // 1 token
    const result = calculateMinOutput(amount, 100);
    // 99% of 1e18 = 990000000000000000
    expect(result).toBe(BigInt('990000000000000000'));
  });

  it('calculates with 0.5% slippage (50 bps)', () => {
    const amount = BigInt('1000000000000000000');
    const result = calculateMinOutput(amount, 50);
    expect(result).toBe(BigInt('995000000000000000'));
  });

  it('calculates with 0% slippage', () => {
    const amount = BigInt('1000000000000000000');
    const result = calculateMinOutput(amount, 0);
    expect(result).toBe(amount);
  });
});

describe('calculatePriceImpact', () => {
  it('returns 0 when no market rate', () => {
    expect(calculatePriceImpact(1000n, 500n, 18, 18)).toBe(0);
  });

  it('returns 0 when market rate is 0', () => {
    expect(calculatePriceImpact(1000n, 500n, 18, 18, 0)).toBe(0);
  });

  it('calculates impact correctly', () => {
    // 1 token in, 0.95 token out, market rate is 1:1
    const amountIn = BigInt('1000000000000000000'); // 1e18
    const amountOut = BigInt('950000000000000000'); // 0.95e18
    const impact = calculatePriceImpact(amountIn, amountOut, 18, 18, 1);
    expect(impact).toBeCloseTo(5, 1); // ~5% impact
  });

  it('returns 0 for zero input', () => {
    expect(calculatePriceImpact(0n, 0n, 18, 18, 1)).toBe(0);
  });

  it('returns 0 when execution is better than market', () => {
    const amountIn = BigInt('1000000000000000000');
    const amountOut = BigInt('1100000000000000000');
    const impact = calculatePriceImpact(amountIn, amountOut, 18, 18, 1);
    expect(impact).toBe(0);
  });
});

describe('buildTrade', () => {
  it('builds trade struct with slippage applied to output', () => {
    const quote: YakQuote = {
      amounts: [BigInt('1000000000000000000'), BigInt('500000000')],
      adapters: ['0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`],
      path: [
        '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' as `0x${string}`,
        '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as `0x${string}`,
      ],
      gasEstimate: 200000n,
    };

    const trade = buildTrade(quote, 100); // 1% slippage
    expect(trade.amountIn).toBe(BigInt('1000000000000000000'));
    expect(trade.amountOut).toBe(BigInt('495000000')); // 99% of 500000000
    expect(trade.path).toEqual(quote.path);
    expect(trade.adapters).toEqual(quote.adapters);
  });
});

describe('getSwapType', () => {
  it('returns swapNoSplitFromAVAX when input is native AVAX', () => {
    expect(getSwapType(NATIVE_AVAX, '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'))
      .toBe('swapNoSplitFromAVAX');
  });

  it('returns swapNoSplitToAVAX when output is native AVAX', () => {
    expect(getSwapType('0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', NATIVE_AVAX))
      .toBe('swapNoSplitToAVAX');
  });

  it('returns swapNoSplit for ERC20 to ERC20', () => {
    expect(getSwapType(
      '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'
    )).toBe('swapNoSplit');
  });
});

describe('getAdapterName', () => {
  it('returns known adapter name', () => {
    expect(getAdapterName('0xdb66686ac8bea67400cf9e5dd6c8849575b90148')).toBe('Trader Joe');
  });

  it('returns DEX for unknown adapters', () => {
    expect(getAdapterName('0x0000000000000000000000000000000000000000')).toBe('DEX');
  });

  it('is case-insensitive', () => {
    expect(getAdapterName('0xDB66686AC8BEA67400CF9E5DD6C8849575B90148')).toBe('Trader Joe');
  });
});
