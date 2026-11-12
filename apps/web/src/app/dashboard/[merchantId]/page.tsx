import Form from 'next/form';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PaymentsTable } from '@/components/dashboard/PaymentsTable';
import { RangeSelect } from '@/components/dashboard/RangeSelect';
import { StatCard } from '@/components/dashboard/StatCard';
import { VolumeChart } from '@/components/dashboard/VolumeChart';
import { getOverview, type Overview as OverviewData } from '@/lib/dashboard/overview';
import { isRange, RANGE_LABEL, type Range, shortDay } from '@/lib/dashboard/range';
import { plural, refundedAndDisputed, successfulCaption } from '@/lib/dashboard/tiles';
import { getDb } from '@/lib/db/client';
import { requireProject } from '@/lib/merchants/require-project';
import { formatMoney } from '@/lib/money';
import { karachiDay } from '@/lib/time';

type Props = PageProps<'/dashboard/[merchantId]'>;

/** Counts, not money: what the merchant should look at next. Only rows with something in them show. */
function NeedsAttention({ a, base, range }: { a: OverviewData['attention']; base: string; range: Range }) {
  const rows = [
    a.openDisputes > 0 && {
      dot: 'bg-destructive',
      text: (
        <>
          <strong>{plural(a.openDisputes, 'dispute')}</strong> {a.openDisputes === 1 ? 'needs' : 'need'} a response
          {a.respondBy && ` by ${shortDay(karachiDay(a.respondBy))}`}
        </>
      ),
      href: `${base}/disputes`,
      action: 'Respond',
    },
    a.failingWebhooks > 0 && {
      dot: 'bg-warning',
      text: (
        <>
          <strong>{plural(a.failingWebhooks, 'webhook delivery', 'webhook deliveries')}</strong> failing
        </>
      ),
      href: `${base}/webhooks`,
      action: 'View',
    },
    a.waitingOtp > 0 && {
      dot: 'bg-muted-foreground',
      text: (
        <>
          <strong>{plural(a.waitingOtp, 'payment')}</strong> waiting for OTP
        </>
      ),
      href: `${base}/payments?status=requires_action&range=${range}`,
      action: 'View',
    },
    a.declines > 0 && {
      dot: 'bg-muted-foreground',
      text: (
        <>
          <strong>{plural(a.declines, 'decline')}</strong> in the {RANGE_LABEL[range].toLowerCase()}
        </>
      ),
      href: `${base}/payments?status=failed&range=${range}`,
      action: 'View',
    },
  ].filter((r) => r !== false);

  return (
    <section aria-labelledby="attention" className="min-w-0 flex-[1_1_18rem] rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 id="attention" className="mb-2 font-semibold">
        Needs attention
      </h2>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nothing needs attention.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.href} className="flex items-start gap-2.5 py-2.5">
              <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${r.dot}`} />
              <span className="flex-1">{r.text}</span>
              <Link href={r.href} className="font-semibold text-primary hover:underline">
                {r.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Overview({ params, searchParams }: Props) {
  const { merchantId } = await params;
  const { merchant } = await requireProject(merchantId);
  const sp = await searchParams;
  const range: Range = isRange(sp.range) ? sp.range : '14d';
  const o = await getOverview(getDb(), merchantId, range, new Date());
  const base = `/dashboard/${merchantId}`;
  const money = (n: number) => formatMoney(n, merchant.currency);
  const out = refundedAndDisputed(o);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Overview</h1>
          <p className="text-muted-foreground">{merchant.name} · test data</p>
        </div>
        {o.allTime > 0 && (
          <Form action={base}>
            <RangeSelect value={range} options={Object.entries(RANGE_LABEL) as [string, string][]} />
          </Form>
        )}
      </div>

      {o.allTime === 0 ? (
        <EmptyState
          title="No payments yet"
          body="Create a checkout session with your secret key and pay it with a test card. Payments show up here."
          action={{ href: `${base}/developers`, label: 'Make your first test payment' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Net volume" value={money(o.netVolume)} caption="after refunds and lost disputes" href={`${base}/payments?range=${range}`} />
            <StatCard
              label="Successful payments"
              value={money(o.successful.amount)}
              caption={successfulCaption(o.successful)}
              href={`${base}/payments?range=${range}`}
            />
            <StatCard label="Refunded and disputed" value={money(out.amount)} caption={out.caption} href={`${base}/payments?range=${range}`} />
          </div>

          <div className="flex flex-wrap items-stretch gap-4">
            <section aria-labelledby="volume" className="min-w-0 flex-[999_1_26rem] rounded-xl border border-border bg-card p-4 md:p-5">
              <h2 id="volume" className="font-semibold">
                Successful volume per day
              </h2>
              <VolumeChart daily={o.daily} currency={merchant.currency} rangeLabel={RANGE_LABEL[range]} />
            </section>
            <NeedsAttention a={o.attention} base={base} range={range} />
          </div>

          <section aria-labelledby="latest" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 id="latest" className="font-semibold">
                Latest payments
              </h2>
              <Link href={`${base}/payments`} className="text-sm font-semibold text-primary hover:underline">
                All payments
              </Link>
            </div>
            <PaymentsTable merchantId={merchantId} currency={merchant.currency} rows={o.recentPayments} compact />
          </section>
        </>
      )}
    </div>
  );
}

export default function OverviewPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading overview…</p>}>
      <Overview {...props} />
    </Suspense>
  );
}
