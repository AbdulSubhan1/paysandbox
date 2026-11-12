import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { DeliveryBadge } from '@/components/dashboard/DeliveryBadge';
import { DisputePanel } from '@/components/dashboard/DisputePanel';
import { CopyId } from '@/components/dashboard/IdText';
import { PaymentMoreMenu } from '@/components/dashboard/PaymentMoreMenu';
import { RefundDialog } from '@/components/dashboard/RefundForm';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { StatusTimeline } from '@/components/dashboard/StatusTimeline';
import { Icon } from '@/components/ui/icon';
import { TEST_CARDS } from '@/lib/card-guard/catalogue';
import { getPaymentDetail } from '@/lib/dashboard/payment-detail';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { formatMoney } from '@/lib/money';
import { closeDisputeAction, refundPaymentAction, simulateDisputeAction } from './actions';

type Props = PageProps<'/dashboard/[merchantId]/payments/[paymentId]'>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Read first, act second: amount, status and who paid up top; Refund (a dialog) and More beside them. */
async function Payment({ params }: Props) {
  const { merchantId, paymentId } = await params;
  await requireProject(merchantId);
  const d = await getPaymentDetail(getDb(), merchantId, paymentId);
  if (!d) notFound();
  const { payment: p, customer } = d;
  const base = `/dashboard/${merchantId}`;
  const money = (n: number) => formatMoney(n, p.currency);
  const card = TEST_CARDS.find((c) => c.key === p.testCard);
  const refundable = p.status === 'succeeded' || p.status === 'partially_refunded';
  const canRefund = refundable && d.amountLeft > 0;
  const canDispute = refundable && !d.dispute;
  const description = d.lineItems[0]?.name;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`${base}/payments`} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-primary hover:underline">
        <Icon name="chevronLeft" className="size-4" />
        Payments
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tabular-nums md:text-4xl">{money(p.amount)}</h1>
            <StatusBadge status={p.status} />
            {p.amountRefunded > 0 && p.amountRefunded < p.amount && <span className="text-sm text-muted-foreground">{money(p.amountRefunded)} refunded</span>}
          </div>
          <p className="mt-1.5 text-muted-foreground">{[description, customer.name, formatPkt(p.createdAt)].filter(Boolean).join(' · ')}</p>
        </div>
        {(canRefund || canDispute) && (
          <div className="flex gap-2">
            {canRefund && <RefundDialog currency={p.currency} amountLeft={d.amountLeft} onRefund={refundPaymentAction.bind(null, merchantId, p.id)} />}
            {canDispute && <PaymentMoreMenu onSimulate={simulateDisputeAction.bind(null, merchantId, p.id)} />}
          </div>
        )}
      </div>

      {d.dispute?.status === 'needs_response' && (
        <DisputePanel dispute={d.dispute} onClose={closeDisputeAction.bind(null, merchantId, p.id, d.dispute.id)} />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Timeline">
            <StatusTimeline items={d.timeline} />
          </Panel>
          {d.refunds.length > 0 && (
            <Panel title="Refunds">
              <ul className="divide-y divide-border text-sm">
                {d.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
                    <span className="font-semibold tabular-nums">{money(r.amount)}</span>
                    <span className="text-muted-foreground">{r.reason.replaceAll('_', ' ')}</span>
                    <span className="text-xs text-muted-foreground">{formatPkt(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Webhooks for this payment">
            {d.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <Link href={`${base}/webhooks/${e.id}`} className="font-mono hover:underline">
                      {e.type}
                    </Link>
                    <DeliveryBadge delivery={e.delivery} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title="Details">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="min-w-0">
                <Link href={`${base}/payments?customer=${encodeURIComponent(customer.email)}`} className="hover:underline">
                  {customer.name}
                </Link>
                <div className="truncate text-muted-foreground" title={customer.email}>
                  {customer.email}
                </div>
              </dd>
              <dt className="text-muted-foreground">Card</dt>
              <dd className="font-mono">
                <span className="capitalize">{p.cardBrand}</span> •••• {p.cardLast4}
              </dd>
              <dt className="text-muted-foreground">Test card</dt>
              <dd>{card?.title ?? p.testCard}</dd>
              {p.failureCode && (
                <>
                  <dt className="text-muted-foreground">Failure</dt>
                  <dd className="font-mono text-xs [overflow-wrap:anywhere]">
                    {p.failureCode}
                    {p.declineCode ? ` · ${p.declineCode}` : ''}
                  </dd>
                </>
              )}
              {p.amountRefunded > 0 && (
                <>
                  <dt className="text-muted-foreground">Refunded</dt>
                  <dd className="tabular-nums">
                    {money(p.amountRefunded)} of {money(p.amount)}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Payment id</dt>
              <dd className="min-w-0">
                <CopyId value={p.id} label="payment id" />
              </dd>
              <dt className="text-muted-foreground">Checkout</dt>
              <dd className="truncate font-mono text-xs" title={p.checkoutSessionId}>
                {p.checkoutSessionId}
              </dd>
            </dl>
          </Panel>
          <Panel title="What was bought">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
              {d.lineItems.map((item, i) => (
                <div key={i} className="contents">
                  <dt className="[overflow-wrap:anywhere]">
                    {item.name}
                    {item.quantity > 1 && <span className="text-muted-foreground"> × {item.quantity}</span>}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {item.amount * item.quantity === 0 ? <span className="font-semibold text-primary">Included</span> : money(item.amount * item.quantity)}
                  </dd>
                </div>
              ))}
              <div className="col-span-2 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(p.amount)}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

export default function PaymentPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading payment…</p>}>
      <Payment {...props} />
    </Suspense>
  );
}
