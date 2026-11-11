/** Currencies a project can charge in. Every one has 2 decimals, so amounts are always in hundredths (paisa, cents, fils). */
export const CURRENCIES = ['pkr', 'usd', 'aed', 'sar', 'gbp', 'eur'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** maxAmount: one checkout's ceiling, roughly PKR 1,000,000 in each currency. */
export const CURRENCY_INFO: Record<Currency, { code: string; name: string; maxAmount: number }> = {
  pkr: { code: 'PKR', name: 'Pakistani rupee', maxAmount: 100_000_000 },
  usd: { code: 'USD', name: 'US dollar', maxAmount: 500_000 },
  aed: { code: 'AED', name: 'UAE dirham', maxAmount: 1_500_000 },
  sar: { code: 'SAR', name: 'Saudi riyal', maxAmount: 1_500_000 },
  gbp: { code: 'GBP', name: 'British pound', maxAmount: 400_000 },
  eur: { code: 'EUR', name: 'Euro', maxAmount: 450_000 },
};

/** A currency code in any case and with surrounding spaces, or null if PaySandbox doesn't offer it. */
export function parseCurrency(value: unknown): Currency | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return (CURRENCIES as readonly string[]).includes(v) ? (v as Currency) : null;
}
