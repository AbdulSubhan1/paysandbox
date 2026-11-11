import { describe, expect, it } from 'vitest';
import { CURRENCIES, CURRENCY_INFO, parseCurrency } from './currency';

describe('currencies', () => {
  it('offers PKR, USD, AED, SAR, GBP and EUR, PKR first', () => {
    expect(CURRENCIES).toEqual(['pkr', 'usd', 'aed', 'sar', 'gbp', 'eur']);
  });

  it('caps one checkout at roughly PKR 1,000,000 in each currency', () => {
    expect(CURRENCY_INFO.pkr.maxAmount).toBe(100_000_000);
    expect(CURRENCY_INFO.usd.maxAmount).toBe(500_000);
    expect(CURRENCY_INFO.aed.maxAmount).toBe(1_500_000);
    expect(CURRENCY_INFO.sar.maxAmount).toBe(1_500_000);
    expect(CURRENCY_INFO.gbp.maxAmount).toBe(400_000);
    expect(CURRENCY_INFO.eur.maxAmount).toBe(450_000);
  });

  it('reads a code in any case and refuses anything else', () => {
    expect(parseCurrency('USD')).toBe('usd');
    expect(parseCurrency(' aed ')).toBe('aed');
    expect(parseCurrency('inr')).toBeNull();
    expect(parseCurrency(5)).toBeNull();
    expect(parseCurrency(undefined)).toBeNull();
  });
});
