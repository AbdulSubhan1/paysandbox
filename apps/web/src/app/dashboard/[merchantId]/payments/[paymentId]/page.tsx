import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { DisputePanel } from '@/components/dashboard/DisputePanel';
import { IdText } from '@/components/dashboard/IdText';
import { RefundForm } from '@/components/dashboard/RefundForm';
import { SimulateDisputeButton } from '@/components/dashboard/SimulateDisputeButton';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { StatusTimeline } from '@/components/dashboard/StatusTimeline';
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
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function Payment({ params }: Props) {
  const { merchantId, paymentId } = await params;
  await requireProject(merchantId);
  const d = await getPaymentDetail(getDb(), merchantId, paymentId);
  if (!d) notFound();
  const { payment: p, customer } = d;
  const base = `/dashboard/${merchantId}`;
  const card = TEST_CARDS.find((c) => c.key === p.testCard);
  const refundable = p.status === 'succeeded' || p.status === 'partially_refunded';
  const canRefund = refundable && d.amountLeft > 0;
  const canDispute = refundable && !d.dispute;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`${base}/payments`} className="text-sm text-muted-foreground hover:underline">
        ← Payments
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tabular-nums">{formatMoney(p.amount, p.currency)}</h1>
            <StatusBadge status={p.status} />
          </div>
          <IdText value={p.id} />
        </div>
        {canDispute && <SimulateDisputeButton onSimulate={simulateDisputeAction.bind(null, merchantId, p.id)} />}
      </div>

      {d.dispute?.status === 'needs_response' && (
        <DisputePanel dispute={d.dispute} onClose={closeDisputeAction.bind(null, merchantId, p.id, d.dispute.id)} />
      )}
      {canRefund && (
        <Panel title="Refund this payment">
          <RefundForm currency={p.currency} amountLeft={d.amountLeft} onRefund={refundPaymentAction.bind(null, merchantId, p.id)} />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Panel title="Timeline">
            <StatusTimeline items={d.timeline} />
          </Panel>
          <Panel title="Webhooks for this payment">
            {d.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`${base}/webhooks/${e.id}`} className="font-mono hover:underline">
                      {e.type}
                    </Link>
                    <span className="text-xs text-muted-foreground">{e.delivery ? e.delivery.state : 'not sent'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-5">
          <Panel title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd>
                <Link href={`${base}/payments?customer=${encodeURIComponent(customer.email)}`} className="hover:underline">
                  {customer.name}
                </Link>
                <div className="text-xs text-muted-foreground">{customer.email}</div>
              </dd>
              <dt className="text-muted-foreground">Card</dt>
              <dd className="font-mono">
                {p.cardBrand} •••• {p.cardLast4}
              </dd>
              <dt className="text-muted-foreground">Test card</dt>
              <dd>{card?.title ?? p.testCard}</dd>
              {p.failureCode && (
                <>
                  <dt className="text-muted-foreground">Failure</dt>
                  <dd className="font-mono">
                    {p.failureCode}
                    {p.declineCode ? ` · ${p.declineCode}` : ''}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Refunded</dt>
              <dd className="tabular-nums">
                {formatMoney(p.amountRefunded, p.currency)} of {formatMoney(p.amount, p.currency)}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatPkt(p.createdAt)}</dd>
              <dt className="text-muted-foreground">Checkout</dt>
              <dd className="font-mono text-xs">{p.checkoutSessionId}</dd>
            </dl>
          </Panel>
          {d.refunds.length > 0 && (
            <Panel title="Refunds">
              <ul className="divide-y divide-border text-sm">
                {d.refunds.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-semibold tabular-nums">{formatMoney(r.amount, p.currency)}</span>
                    <span className="text-muted-foreground">{r.reason.replaceAll('_', ' ')}</span>
                    <span className="text-xs text-muted-foreground">{formatPkt(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
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
