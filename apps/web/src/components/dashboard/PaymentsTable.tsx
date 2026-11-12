import Link from 'next/link';
import type { Currency } from '@/lib/currency';
import type { DashboardPaymentRow } from '@/lib/dashboard/overview';
import { formatPkt } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

type Props = {
  merchantId: string;
  currency: Currency;
  rows: DashboardPaymentRow[];
  /** The overview's short list: description, status, customer name and amount only. */
  compact?: boolean;
};

const cell = 'block px-0 md:table-cell md:px-3 md:py-3 md:align-top';

/**
 * Description · Status · Customer · Card · Date · Amount. The description links to the payment. On phones each row
 * is a stacked card (description and amount on top); from md up it is a table that wraps rather than scrolls.
 */
export function PaymentsTable({ merchantId, currency, rows, compact = false }: Props) {
  const headings = compact ? ['Description', 'Status', 'Customer'] : ['Description', 'Status', 'Customer', 'Card', 'Date'];
  return (
    <div className="rounded-xl border border-border bg-card">
      <table className="block w-full text-sm md:table">
        <thead className="hidden text-left text-xs text-muted-foreground md:table-header-group">
          <tr className="border-b border-border">
            {headings.map((h, i) => (
              <th key={h} scope="col" className={cn('py-2 pr-3 font-medium whitespace-nowrap', i === 0 ? 'pl-4' : 'pl-3')}>
                {h}
              </th>
            ))}
            <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((p) => {
            const [day, time] = formatPkt(p.createdAt).split(', ');
            const muted = p.status === 'failed' || p.status === 'requires_action';
            return (
              <tr
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-0 md:table-row md:px-0 md:py-0 md:hover:bg-muted/50"
              >
                <td className={cn(cell, 'col-start-1 row-start-1 min-w-0 md:pl-4')}>
                  <Link href={`/dashboard/${merchantId}/payments/${p.id}`} className="font-semibold [overflow-wrap:anywhere] hover:underline">
                    {p.description ?? 'Payment'}
                  </Link>
                  {!compact && <span title={p.id} className="block truncate font-mono text-xs text-muted-foreground">
                      {p.id}
                    </span>}
                </td>
                <td className={cn(cell, 'col-start-2 row-start-2 justify-self-end')}>
                  <StatusBadge status={p.status} />
                </td>
                <td className={cn(cell, 'col-start-1 row-start-2 min-w-0')}>
                  {p.customerName}
                  {!compact && <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.customerEmail}</span>}
                </td>
                {!compact && (
                  <>
                    <td className={cn(cell, 'col-start-1 row-start-3 font-mono text-xs whitespace-nowrap text-muted-foreground md:text-sm md:text-foreground')}>
                      •••• {p.cardLast4}
                    </td>
                    <td className={cn(cell, 'col-start-2 row-start-3 text-right text-xs text-muted-foreground md:text-left md:text-sm')}>
                      <span className="whitespace-nowrap">{day}</span>
                      <span className="whitespace-nowrap md:block">
                        <span className="md:hidden">, </span>
                        {time}
                      </span>
                    </td>
                  </>
                )}
                <td className={cn(cell, 'col-start-2 row-start-1 text-right font-semibold whitespace-nowrap tabular-nums md:pr-4', muted && 'text-muted-foreground')}>
                  {formatMoney(p.amount, currency)}
                  {p.amountRefunded > 0 && p.amountRefunded < p.amount && (
                    <span className="block text-xs font-normal text-muted-foreground">{formatMoney(p.amountRefunded, currency)} refunded</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
