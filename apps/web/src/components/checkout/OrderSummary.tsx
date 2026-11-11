import { Money } from '@/components/common/Money';
import type { LineItem } from '@/lib/db/schema';

export function OrderSummary({ merchantName, lineItems, amount }: { merchantName: string; lineItems: LineItem[]; amount: number }) {
  return (
    <section aria-label="Order summary">
      <div className="flex items-center gap-2 font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-[#7a4b2a] text-sm text-white">{merchantName.slice(0, 1)}</span>
        <span className="break-words">{merchantName}</span>
        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">Test</span>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Pay {merchantName}</p>
      <Money paisa={amount} className="block text-4xl font-bold tracking-tight" />
      <ul className="mt-6 border-t border-border">
        {lineItems.map((item, i) => (
          <li key={i} className="flex justify-between gap-4 border-b border-border py-3 text-sm">
            <span className="min-w-0 break-words">
              {item.name}
              <span className="block text-xs text-muted-foreground">Qty {item.quantity}</span>
            </span>
            <Money paisa={item.amount * item.quantity} className="shrink-0" />
          </li>
        ))}
        <li className="flex justify-between py-3 text-sm font-bold">
          <span>Total due</span>
          <Money paisa={amount} />
        </li>
      </ul>
    </section>
  );
}
