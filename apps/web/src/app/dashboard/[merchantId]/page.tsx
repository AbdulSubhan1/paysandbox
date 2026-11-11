import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PaymentsTable } from '@/components/dashboard/PaymentsTable';
import { StatCard } from '@/components/dashboard/StatCard';
import { STATUS_META } from '@/components/dashboard/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import { getOverview } from '@/lib/dashboard/overview';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { formatMoney } from '@/lib/money';
import type { PaymentStatus } from '@/lib/payments/state';

const ORDER: PaymentStatus[] = ['succeeded', 'partially_refunded', 'refunded', 'failed', 'requires_action', 'disputed', 'dispute_lost'];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function Overview({ params }: { params: PageProps<'/dashboard/[merchantId]'>['params'] }) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const o = await getOverview(getDb(), merchantId);
  const base = `/dashboard/${merchantId}`;
  const total = Object.values(o.statusCounts).reduce((n, c) => n + (c ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground">Totals for {merchant.name}. All amounts are test data.</p>
      </div>
      {total === 0 ? (
        <EmptyState
          title="No payments yet"
          body="Create a checkout session with your secret key and pay it with a test card. Payments show up here."
          action={{ href: `${base}/developers`, label: 'Make your first test payment' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Net volume" value={formatMoney(o.netVolume, merchant.currency)} caption="after refunds and lost disputes" href={`${base}/payments`} dot="bg-foreground" />
            <StatCard label="Succeeded" value={formatMoney(o.succeeded.amount, merchant.currency)} caption={plural(o.succeeded.count, 'payment')} href={`${base}/payments?status=succeeded`} dot="bg-success" />
            <StatCard label="Refunded" value={formatMoney(o.refunded.amount, merchant.currency)} caption={`${plural(o.refunded.count, 'payment')}, incl. partial`} href={`${base}/payments?status=refunded`} dot="bg-muted-foreground" />
            <StatCard label="Failed" value={formatMoney(o.failed.amount, merchant.currency)} caption={plural(o.failed.count, 'payment')} href={`${base}/payments?status=failed`} dot="bg-destructive" />
            <StatCard label="Needs OTP" value={formatMoney(o.needsOtp.amount, merchant.currency)} caption={`${o.needsOtp.count} waiting`} href={`${base}/payments?status=requires_action`} dot="bg-warning" />
            <StatCard label="Disputed" value={formatMoney(o.disputed.amount, merchant.currency)} caption={plural(o.disputed.count, 'dispute')} href={`${base}/disputes`} dot="bg-violet" />
          </div>

          <section aria-labelledby="by-status" className="rounded-xl border border-border bg-card p-4">
            <h2 id="by-status" className="mb-3 font-semibold">
              Payments by status
            </h2>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
              {ORDER.filter((s) => o.statusCounts[s]).map((s) => (
                <span key={s} className={STATUS_META[s].dot} style={{ width: `${((o.statusCounts[s] ?? 0) / total) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {ORDER.filter((s) => o.statusCounts[s]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${STATUS_META[s].dot}`} aria-hidden />
                  {STATUS_META[s].label} · {o.statusCounts[s]}
                </li>
              ))}
            </ul>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-labelledby="recent-payments" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="recent-payments" className="font-semibold">
                  Recent payments
                </h2>
                <Link href={`${base}/payments`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  All payments
                </Link>
              </div>
              <PaymentsTable merchantId={merchantId} currency={merchant.currency} rows={o.recentPayments} />
            </section>
            <section aria-labelledby="recent-webhooks" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="recent-webhooks" className="font-semibold">
                  Recent webhooks
                </h2>
                <Link href={`${base}/webhooks`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  Webhooks
                </Link>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                {o.recentEvents.length === 0 && <li className="p-4 text-muted-foreground">No events yet.</li>}
                {o.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <Link href={`${base}/webhooks/${e.id}`} className="font-mono hover:underline">
                      {e.type}
                    </Link>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">{formatPkt(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function OverviewPage({ params }: PageProps<'/dashboard/[merchantId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading overview…</p>}>
      <Overview params={params} />
    </Suspense>
  );
}
