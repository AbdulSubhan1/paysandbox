import { addActivity } from '@/lib/payments/activity';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/lib/api/errors';
import type { Db } from '@/lib/db/client';
import { payments, refunds } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { newId } from '@/lib/ids';
import { formatPkr } from '@/lib/money';
import type { PaymentRow } from '@/lib/payments/objects';
import { assertTransition } from '@/lib/payments/state';

export const REFUND_REASONS = ['requested_by_customer', 'duplicate', 'fraudulent'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export type RefundRow = typeof refunds.$inferSelect;

const invalid = (code: string, message: string, param?: string) => new ApiError(400, 'invalid_request_error', code, message, param);

export function toRefundObject(row: RefundRow) {
  return {
    id: row.id,
    object: 'refund' as const,
    amount: row.amount,
    currency: 'pkr' as const,
    payment: row.paymentId,
    reason: row.reason,
    status: row.status,
    created: Math.floor(row.createdAt.getTime() / 1000),
    livemode: false as const,
  };
}

/** Refunds all or part of what is left, in one transaction with the payment row locked, so parallel refunds can't overspend. */
export async function createRefund(
  db: Db,
  r: { merchantId: string; paymentId: string; amount?: number; reason: RefundReason; now: Date },
): Promise<{ refund: RefundRow; payment: PaymentRow }> {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, r.paymentId), eq(payments.merchantId, r.merchantId)))
      .for('update');
    if (!payment) throw new ApiError(404, 'invalid_request_error', 'resource_missing', `No such payment: ${r.paymentId}`, 'payment');
    if (payment.status === 'disputed') throw invalid('payment_disputed', 'This payment has an open dispute and cannot be refunded.', 'payment');
    if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded')
      throw invalid('payment_not_refundable', `A ${payment.status} payment cannot be refunded.`, 'payment');

    const left = payment.amount - payment.amountRefunded;
    const amount = r.amount ?? left;
    if (amount > left) throw invalid('amount_too_large', `Only ${formatPkr(left)} is left to refund.`, 'amount');
    const status = amount === left ? 'refunded' : 'partially_refunded';
    assertTransition(payment.status, status);

    const [refund] = await tx
      .insert(refunds)
      .values({ id: newId('re'), merchantId: r.merchantId, paymentId: payment.id, amount, reason: r.reason, createdAt: r.now })
      .returning();
    const [updated] = await tx
      .update(payments)
      .set({ amountRefunded: payment.amountRefunded + amount, status, updatedAt: r.now })
      .where(eq(payments.id, payment.id))
      .returning();
    await addActivity(
      tx,
      [{ checkoutSessionId: payment.checkoutSessionId, paymentId: payment.id, kind: 'refunded', message: `Refunded ${formatPkr(amount)}`, detail: { refund: refund.id, reason: r.reason } }],
      r.now,
    );
    await recordEvent(tx, { merchantId: r.merchantId, type: 'refund.created', payload: toRefundObject(refund), now: r.now });
    return { refund, payment: updated };
  });
}

