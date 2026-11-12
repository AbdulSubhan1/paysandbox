import Form from 'next/form';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PositionPager } from '@/components/dashboard/Pager';
import { PaymentsTable } from '@/components/dashboard/PaymentsTable';
import { RangeSelect } from '@/components/dashboard/RangeSelect';
import { STATUS_META } from '@/components/dashboard/StatusBadge';
import { Icon } from '@/components/ui/icon';
import { listDashboardPayments, paymentStatusCounts } from '@/lib/dashboard/payments';
import { isRange, RANGE_LABEL, rangeStart } from '@/lib/dashboard/range';
import { getDb } from '@/lib/db/client';
import { requireProject } from '@/lib/merchants/require-project';
import type { PaymentStatus } from '@/lib/payments/state';
import { cn } from '@/lib/utils';

const CHIPS: (PaymentStatus | 'all')[] = ['all', 'succeeded', 'failed', 'partially_refunded', 'refunded', 'requires_action', 'disputed', 'dispute_lost'];
const isStatus = (s: unknown): s is PaymentStatus => typeof s === 'string' && CHIPS.some((k) => k === s && k !== 'all');
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

type Props = PageProps<'/dashboard/[merchantId]/payments'>;

async function Payments({ params, searchParams }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const sp = await searchParams;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const range = isRange(sp.range) ? sp.range : undefined;
  const [customer, q, before, after] = [text(sp.customer), text(sp.q)?.slice(0, 100), text(sp.before), text(sp.after)];
  const filter = { customerEmail: customer, q, since: range ? rangeStart(range, new Date()) : undefined };
  const db = getDb();
  const [page, counts] = await Promise.all([
    listDashboardPayments(db, merchantId, { ...filter, status, before, after }),
    paymentStatusCounts(db, merchantId, filter),
  ]);
  const base = `/dashboard/${merchantId}/payments`;
  // Every link keeps the filters; a new status or a new page drops the other cursor.
  const link = (o: { status?: string; before?: string | null; after?: string | null }) => {
    const qs = new URLSearchParams();
    const st = 'status' in o ? o.status : status;
    if (st && st !== 'all') qs.set('status', st);
    if (customer) qs.set('customer', customer);
    if (q) qs.set('q', q);
    if (range) qs.set('range', range);
    if (o.before) qs.set('before', o.before);
    if (o.after) qs.set('after', o.after);
    return qs.size ? `${base}?${qs}` : base;
  };
  const filtered = !!(q || range || customer);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Payments</h1>
        <p className="text-muted-foreground">
          {customer ? (
            <>
              Showing {customer} only ·{' '}
              <Link href={base} className="underline">
                clear
              </Link>
            </>
          ) : (
            'Newest first. Open one to see its timeline and webhooks.'
          )}
        </p>
      </div>

      <nav aria-label="Payment status" className="flex flex-wrap gap-1.5">
        {CHIPS.map((k) => {
          const on = (status ?? 'all') === k;
          const n = k === 'all' ? counts.all : (counts[k] ?? 0);
          if (k === 'dispute_lost' && n === 0 && !on) return null; // rare, so only shown once there is one
          return (
            <Link
              key={k}
              href={link({ status: k })}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm',
                on ? 'border-foreground bg-foreground font-semibold text-background' : 'border-input bg-card hover:border-primary',
              )}
            >
              {k === 'all' ? 'All' : STATUS_META[k].label}
              <span className="tabular-nums opacity-80">{n}</span>
            </Link>
          );
        })}
      </nav>

      <Form action={base} className="flex flex-wrap gap-2.5" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        {customer && <input type="hidden" name="customer" value={customer} />}
        <label className="flex h-10 min-w-0 flex-[1_1_16rem] items-center gap-2 rounded-lg border border-input bg-white px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Icon name="search" className="size-4 text-muted-foreground" />
          <span className="sr-only">Search payments</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Email, name or pay_ id"
            className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
          />
        </label>
        <RangeSelect value={range ?? ''} options={[['', 'All time'], ...(Object.entries(RANGE_LABEL) as [string, string][])]} />
        <button type="submit" className="sr-only">
          Search
        </button>
      </Form>

      {page.rows.length === 0 ? (
        <EmptyState title="No payments here" body={counts.all === 0 && !filtered ? 'No test payments yet.' : 'No payments match these filters.'} />
      ) : (
        <PaymentsTable merchantId={merchantId} currency={merchant.currency} rows={page.rows} />
      )}
      <PositionPager
        from={page.from}
        count={page.rows.length}
        total={page.total}
        prevHref={page.prev && link({ after: page.prev })}
        nextHref={page.next && link({ before: page.next })}
      />
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
