import { describe, it, expect } from 'vitest';
import {
  formatAddress,
  formatTxHash,
  formatWei,
  formatNanoAvax,
  formatNumber,
  formatLargeNumber,
  formatUSD,
  formatPrice,
  formatPercentage,
  formatGas,
  formatGasPrice,
  formatBlockTime,
  formatTPS,
  getChangeType,
  getChangeColor,
  getChangeArrow,
} from '../formatters';

describe('formatAddress', () => {
  it('truncates a long address', () => {
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678'))
      .toBe('0x1234...5678');
  });

  it('returns short addresses unchanged', () => {
    expect(formatAddress('0x1234')).toBe('0x1234');
  });

  it('returns empty string for empty input', () => {
    expect(formatAddress('')).toBe('');
  });

  it('respects custom prefix/suffix lengths', () => {
    expect(formatAddress('0x1234567890abcdef1234567890abcdef12345678', 4, 2))
      .toBe('0x12...78');
  });
});

describe('formatTxHash', () => {
  it('truncates a transaction hash', () => {
    const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(formatTxHash(hash)).toBe('0xabcdef12...567890');
  });
});

describe('formatWei', () => {
  it('formats wei to AVAX', () => {
    expect(formatWei('1000000000000000000')).toBe('1.0000 AVAX');
  });

  it('returns 0 AVAX for zero', () => {
    expect(formatWei('0')).toBe('0 AVAX');
  });

  it('handles very small amounts', () => {
    expect(formatWei('1000')).toBe('<0.0001 AVAX');
  });

  it('supports custom decimals', () => {
    expect(formatWei('1500000000000000000', 2)).toBe('1.50 AVAX');
  });
});

describe('formatNanoAvax', () => {
  it('formats nAVAX to AVAX', () => {
    expect(formatNanoAvax(1_000_000_000)).toBe('1.0000 AVAX');
  });

  it('returns 0 AVAX for zero', () => {
    expect(formatNanoAvax(0)).toBe('0 AVAX');
  });

  it('handles very small amounts', () => {
    expect(formatNanoAvax(1)).toBe('<0.0001 AVAX');
  });
});

describe('formatNumber', () => {
  it('formats numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles small numbers', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatLargeNumber', () => {
  it('formats billions', () => {
    expect(formatLargeNumber(1_500_000_000)).toBe('1.5B');
  });

  it('formats millions', () => {
    expect(formatLargeNumber(38_946_445)).toBe('38.9M');
  });

  it('formats thousands', () => {
    expect(formatLargeNumber(5_432)).toBe('5.4K');
  });

  it('formats small numbers', () => {
    expect(formatLargeNumber(999)).toBe('999');
  });
});

describe('formatUSD', () => {
  it('formats billions', () => {
    expect(formatUSD(2_500_000_000)).toBe('$2.50B');
  });

  it('formats millions', () => {
    expect(formatUSD(1_234_567)).toBe('$1.23M');
  });

  it('formats thousands', () => {
    expect(formatUSD(5_678)).toBe('$5.68K');
  });

  it('formats small amounts', () => {
    expect(formatUSD(42.567)).toBe('$42.57');
  });

  it('supports custom decimals', () => {
    expect(formatUSD(42.567, 4)).toBe('$42.5670');
  });
});

describe('formatPrice', () => {
  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats very small prices with scientific notation', () => {
    const result = formatPrice(0.00001);
    expect(result).toMatch(/^\$\d\.\d+e[+-]\d+$/);
  });

  it('formats sub-dollar prices', () => {
    expect(formatPrice(0.5432)).toBe('$0.5432');
  });

  it('formats moderate prices', () => {
    expect(formatPrice(42.56)).toBe('$42.56');
  });

  it('formats large prices', () => {
    const result = formatPrice(1234.56);
    expect(result).toContain('$');
    expect(result).toContain('1,234.56');
  });
});

describe('formatPercentage', () => {
  it('formats positive percentage with plus sign', () => {
    expect(formatPercentage(5.678)).toBe('+5.68%');
  });

  it('formats negative percentage', () => {
    expect(formatPercentage(-3.21)).toBe('-3.21%');
  });

  it('formats zero', () => {
    expect(formatPercentage(0)).toBe('+0.00%');
  });
});

describe('formatGas', () => {
  it('formats millions', () => {
    expect(formatGas(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatGas(21_000)).toBe('21.0K');
  });

  it('formats small values', () => {
    expect(formatGas(500)).toBe('500');
  });
});

describe('formatGasPrice', () => {
  it('converts wei to nAVAX', () => {
    expect(formatGasPrice(25_000_000_000)).toBe('25 nAVAX');
  });
});

describe('formatBlockTime', () => {
  it('formats block time in seconds', () => {
    expect(formatBlockTime(2.1)).toBe('2.1s');
  });
});

describe('formatTPS', () => {
  it('formats thousands', () => {
    expect(formatTPS(1500)).toBe('1.5K');
  });

  it('formats small values', () => {
    expect(formatTPS(42.7)).toBe('43');
  });
});

describe('getChangeType', () => {
  it('returns positive for positive values', () => {
    expect(getChangeType(5)).toBe('positive');
  });

  it('returns negative for negative values', () => {
    expect(getChangeType(-3)).toBe('negative');
  });

  it('returns neutral for zero', () => {
    expect(getChangeType(0)).toBe('neutral');
  });
});

describe('getChangeColor', () => {
  it('returns green for positive', () => {
    expect(getChangeColor(5)).toBe('#4dff88');
  });

  it('returns red for negative', () => {
    expect(getChangeColor(-3)).toBe('#ff4d4d');
  });

  it('returns blue for neutral', () => {
    expect(getChangeColor(0)).toBe('#8be4ff');
  });
});

describe('getChangeArrow', () => {
  it('returns up arrow for positive', () => {
    expect(getChangeArrow(5)).toBe('↑');
  });

  it('returns down arrow for negative', () => {
    expect(getChangeArrow(-3)).toBe('↓');
  });

  it('returns empty for zero', () => {
    expect(getChangeArrow(0)).toBe('');
  });
});
