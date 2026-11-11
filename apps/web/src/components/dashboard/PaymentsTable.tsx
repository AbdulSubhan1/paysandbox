import Link from 'next/link';
import { formatPkt } from '@/lib/format';
import type { DashboardPaymentRow } from '@/lib/dashboard/overview';
import type { Currency } from '@/lib/currency';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from './StatusBadge';

/** Amount · Status · Customer · Card · Date · Payment ID; the amount links to the detail page. */
export function PaymentsTable({ merchantId, currency, rows }: { merchantId: string; currency: Currency; rows: DashboardPaymentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Payments">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            {['Amount', 'Status', 'Customer', 'Card', 'Date', 'Payment ID'].map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50">
              <td className="px-4 py-2 font-semibold whitespace-nowrap tabular-nums">
                <Link href={`/dashboard/${merchantId}/payments/${p.id}`} className="hover:underline">
                  {formatMoney(p.amount, currency)}
                </Link>
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-4 py-2">
                {p.customerName}
                <div className="text-xs text-muted-foreground">{p.customerEmail}</div>
              </td>
              <td className="px-4 py-2 font-mono whitespace-nowrap">•••• {p.cardLast4}</td>
              <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatPkt(p.createdAt)}</td>
              <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">{p.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
