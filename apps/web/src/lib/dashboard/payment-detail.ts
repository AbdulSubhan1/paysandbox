import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, disputes, events, paymentActivity, payments, refunds, webhookDeliveries } from '@/lib/db/schema';
import type { DisputeRow } from '@/lib/disputes/disputes';
import type { CustomerRow, PaymentRow } from '@/lib/payments/objects';
import type { RefundRow } from '@/lib/refunds/refunds';
import { type EventListRow, eventRowColumns, toEventListRow } from './overview';

export type TimelineItem = { kind: string; message: string; at: Date; detail: unknown };
export type PaymentDetail = {
  payment: PaymentRow;
  customer: CustomerRow;
  timeline: TimelineItem[];
  refunds: RefundRow[];
  dispute: DisputeRow | null;
  events: EventListRow[];
  amountLeft: number;
};

export async function getPaymentDetail(db: Db, merchantId: string, paymentId: string): Promise<PaymentDetail | null> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.merchantId, merchantId)));
  if (!payment) return null;

  const [[customer], timeline, refundRows, [dispute], eventRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, payment.customerId)),
    // The session's own rows (e.g. "Checkout session created") plus this payment's, not other attempts on the session.
    db
      .select({ kind: paymentActivity.kind, message: paymentActivity.message, at: paymentActivity.createdAt, detail: paymentActivity.detail })
      .from(paymentActivity)
      .where(
        and(
          eq(paymentActivity.checkoutSessionId, payment.checkoutSessionId),
          or(eq(paymentActivity.paymentId, payment.id), isNull(paymentActivity.paymentId)),
        ),
      )
      .orderBy(asc(paymentActivity.createdAt), asc(paymentActivity.seq)),
    db.select().from(refunds).where(eq(refunds.paymentId, payment.id)).orderBy(asc(refunds.createdAt)),
    db.select().from(disputes).where(eq(disputes.paymentId, payment.id)),
    db
      .select(eventRowColumns)
      .from(events)
      .leftJoin(webhookDeliveries, eq(webhookDeliveries.eventId, events.id))
      .where(
        and(
          eq(events.merchantId, merchantId),
          or(sql`${events.payload}->>'id' = ${payment.id}`, sql`${events.payload}->>'payment' = ${payment.id}`),
        ),
      )
      .orderBy(desc(events.createdAt), desc(events.id)),
  ]);

  return {
    payment,
    customer,
    timeline,
    refunds: refundRows,
    dispute: dispute ?? null,
    events: eventRows.map(toEventListRow),
    amountLeft: payment.amount - payment.amountRefunded,
  };
}
