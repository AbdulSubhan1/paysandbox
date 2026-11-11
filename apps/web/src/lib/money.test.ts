import { describe, expect, it } from 'vitest';
import { formatPkr } from './money';

describe('formatPkr', () => {
  it('formats paisa as rupees with two decimals', () => {
    expect(formatPkr(510000)).toBe('PKR 5,100.00');
    expect(formatPkr(100)).toBe('PKR 1.00');
    expect(formatPkr(100000000)).toBe('PKR 1,000,000.00');
    expect(formatPkr(5)).toBe('PKR 0.05');
  });

  it('rejects non-integer paisa', () => {
    expect(() => formatPkr(1.5)).toThrow();
  });
});
