import type { Currency } from '@/lib/currency';
import { formatMoney } from '@/lib/money';

export function Money({ amount, currency, className }: { amount: number; currency: Currency; className?: string }) {
  return <span className={className}>{formatMoney(amount, currency)}</span>;
}
