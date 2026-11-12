import { Money } from '@/components/common/Money';
import { Icon } from '@/components/ui/icon';
import type { Currency } from '@/lib/currency';
import type { LineItem } from '@/lib/db/schema';

type Props = { merchantName: string; lineItems: LineItem[]; amount: number; currency: Currency };

/** The avatar letter, uppercase however the merchant typed their name. */
export const merchantInitial = (name: string) => name.trim().slice(0, 1).toUpperCase();

export function OrderSummary({ merchantName, lineItems, amount, currency }: Props) {
  return (
    <section aria-label="Order summary">
      <div className="flex items-center gap-2 font-semibold">
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-[#7a4b2a] text-sm text-white">
          {merchantInitial(merchantName)}
        </span>
        <span className="break-words">{merchantName}</span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Test</span>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Pay {merchantName}</p>
      <Money amount={amount} currency={currency} className="block text-4xl font-bold tracking-tight" />
      <ul className="mt-6 border-t border-border">
        <LineItems lineItems={lineItems} currency={currency} />
        <li className="flex justify-between py-3 text-sm font-bold">
          <span>Total due</span>
          <Money amount={amount} currency={currency} />
        </li>
      </ul>
    </section>
  );
}

/** One row per line: "Qty N" only when N > 1, "Included" for a line that costs nothing. */
function LineItems({ lineItems, currency }: Pick<Props, 'lineItems' | 'currency'>) {
  return lineItems.map((item, i) => (
    <li key={i} className="flex justify-between gap-4 border-b border-border py-3 text-sm">
      <span className="min-w-0 break-words">
        {item.name}
        {item.quantity > 1 && <span className="block text-xs text-muted-foreground">Qty {item.quantity}</span>}
      </span>
      {item.amount * item.quantity === 0 ? (
        <span className="shrink-0 text-muted-foreground">Included</span>
      ) : (
        <Money amount={item.amount * item.quantity} currency={currency} className="shrink-0" />
      )}
    </li>
  ));
}

/**
 * Phones only: back link, merchant, and the order folded into "Order summary · N items  PKR X" above the form, so
 * the card fields come first. Tapping it opens the lines.
 */
export function PhoneOrderSummary({ merchantName, lineItems, amount, currency, backHref }: Props & { backHref: string }) {
  const items = lineItems.reduce((n, item) => n + item.quantity, 0);
  return (
    <section aria-label="Order summary" className="px-4 pt-2 pb-1">
      <div className="flex items-center gap-2 font-semibold">
        <a href={backHref} aria-label={`Back to ${merchantName}`} className="-ml-2 grid size-10 place-items-center rounded-lg text-foreground">
          <Icon name="chevronLeft" className="size-5" />
        </a>
        <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[#7a4b2a] text-sm text-white">
          {merchantInitial(merchantName)}
        </span>
        <span className="min-w-0 truncate">{merchantName}</span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Test</span>
      </div>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Order summary · {items} {items === 1 ? 'item' : 'items'}
            <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
          </span>
          <Money amount={amount} currency={currency} className="text-xl font-bold tabular-nums" />
        </summary>
        <ul className="border-t border-border pb-2">
          <LineItems lineItems={lineItems} currency={currency} />
        </ul>
      </details>
    </section>
  );
}
