import { CURRENCY_INFO, type Currency } from '@/lib/currency';

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats an integer amount in the smallest unit as e.g. `PKR 1,234.56` or `USD 299.99`. */
export function formatMoney(amount: number, currency: Currency): string {
  if (!Number.isSafeInteger(amount)) throw new TypeError(`amount must be a safe integer, got ${amount}`);
  return `${CURRENCY_INFO[currency].code} ${TWO_DECIMALS.format(amount / 100)}`;
}
