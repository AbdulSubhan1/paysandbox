import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Pager } from '@/components/dashboard/Pager';
import { PaymentsTable } from '@/components/dashboard/PaymentsTable';
import { listDashboardPayments, paymentStatusCounts } from '@/lib/dashboard/payments';
import { getDb } from '@/lib/db/client';
import { requireProject } from '@/lib/merchants/require-project';
import type { PaymentStatus } from '@/lib/payments/state';
import { cn } from '@/lib/utils';

const CHIPS: [PaymentStatus | 'all', string][] = [
  ['all', 'All'],
  ['succeeded', 'Succeeded'],
  ['failed', 'Failed'],
  ['partially_refunded', 'Partially refunded'],
  ['refunded', 'Refunded'],
  ['requires_action', 'Needs OTP'],
  ['disputed', 'Disputed'],
];
const isStatus = (s: unknown): s is PaymentStatus => typeof s === 'string' && CHIPS.some(([k]) => k === s && k !== 'all');

type Props = PageProps<'/dashboard/[merchantId]/payments'>;

async function Payments({ params, searchParams }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const sp = await searchParams;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const customer = typeof sp.customer === 'string' ? sp.customer : undefined;
  const before = typeof sp.before === 'string' ? sp.before : undefined;
  const db = getDb();
  const [page, counts] = await Promise.all([
    listDashboardPayments(db, merchantId, { status, customerEmail: customer, before }),
    paymentStatusCounts(db, merchantId, { customerEmail: customer }),
  ]);
  const base = `/dashboard/${merchantId}/payments`;
  const link = (o: { status?: string; before?: string | null }) => {
    const q = new URLSearchParams();
    const st = 'status' in o ? o.status : status;
    if (st && st !== 'all') q.set('status', st);
    if (customer) q.set('customer', customer);
    if (o.before) q.set('before', o.before);
    return q.size ? `${base}?${q}` : base;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">
          {customer ? (
            <>
              Showing {customer} only ·{' '}
              <Link href={base} className="underline">
                clear
              </Link>
            </>
          ) : (
            'Every test payment, newest first. Open one to see its timeline.'
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {CHIPS.map(([k, label]) => {
          const on = (status ?? 'all') === k;
          return (
            <Link
              key={k}
              href={link({ status: k })}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary',
              )}
            >
              {label}
              <span className="tabular-nums opacity-80">{k === 'all' ? counts.all : (counts[k] ?? 0)}</span>
            </Link>
          );
        })}
      </div>
      {page.rows.length === 0 ? (
        <EmptyState title="No payments here" body={counts.all === 0 ? 'No test payments yet.' : 'No payments match this filter.'} />
      ) : (
        <PaymentsTable merchantId={merchantId} currency={merchant.currency} rows={page.rows} />
      )}
      <Pager next={page.next} isFirst={!before} href={(b) => link({ before: b })} />
    </div>
  );
}

export default function PaymentsPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading payments…</p>}>
      <Payments {...props} />
    </Suspense>
  );
}
