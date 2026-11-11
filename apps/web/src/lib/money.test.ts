import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats the smallest unit with the currency code and two decimals', () => {
    expect(formatMoney(510000, 'pkr')).toBe('PKR 5,100.00');
    expect(formatMoney(100, 'pkr')).toBe('PKR 1.00');
    expect(formatMoney(100000000, 'pkr')).toBe('PKR 1,000,000.00');
    expect(formatMoney(5, 'pkr')).toBe('PKR 0.05');
    expect(formatMoney(29999, 'usd')).toBe('USD 299.99');
    expect(formatMoney(1_500_000, 'aed')).toBe('AED 15,000.00');
  });

  it('rejects a fractional amount', () => {
    expect(() => formatMoney(1.5, 'usd')).toThrow();
  });
});
