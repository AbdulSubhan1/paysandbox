import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { listCustomers } from '@/lib/dashboard/customers';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { formatMoney } from '@/lib/money';

type Props = PageProps<'/dashboard/[merchantId]/customers'>;

async function Customers({ params }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const rows = await listCustomers(getDb(), merchantId);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-muted-foreground">One row per email address. Net paid is after refunds and lost disputes.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No customers yet" body="A customer is added the first time someone pays one of your checkouts." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Customers">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {['Name', 'Email', 'Payments', 'Net paid', 'Last payment'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/${merchantId}/payments?customer=${encodeURIComponent(c.email)}`} className="hover:underline">
                      {c.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{c.payments}</td>
                  <td className="px-4 py-2 font-semibold whitespace-nowrap tabular-nums">{formatMoney(c.netPaid, merchant.currency)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{c.lastPaymentAt ? formatPkt(c.lastPaymentAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading customers…</p>}>
      <Customers {...props} />
    </Suspense>
  );
}
