import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { listDisputes } from '@/lib/dashboard/disputes';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

type Props = PageProps<'/dashboard/[merchantId]/disputes'>;

const BADGE = {
  needs_response: ['Needs response', 'bg-violet-soft text-violet'],
  won: ['Won', 'bg-success-soft text-success'],
  lost: ['Lost', 'bg-destructive-soft text-destructive'],
} as const;

async function Disputes({ params }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const rows = await listDisputes(getDb(), merchantId);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Disputes</h1>
        <p className="text-muted-foreground">Open disputes first. An unanswered dispute is lost automatically on its respond-by date.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No disputes" body="Pay with card 4000 0000 0000 0259, or use Simulate dispute on a payment." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Disputes">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {['Amount', 'Status', 'Reason', 'Customer', 'Respond by', 'Payment'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold whitespace-nowrap tabular-nums">{formatMoney(d.amount, merchant.currency)}</td>
                  <td className="px-4 py-2">
                    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', BADGE[d.status][1])}>
                      {BADGE[d.status][0]}
                    </span>
                  </td>
                  <td className="px-4 py-2">{d.reason.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-2">{d.customerName}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{d.status === 'needs_response' ? formatPkt(d.respondBy) : '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/dashboard/${merchantId}/payments/${d.paymentId}`} className="hover:underline">
                      {d.paymentId}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DisputesPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading disputes…</p>}>
      <Disputes {...props} />
    </Suspense>
  );
}
