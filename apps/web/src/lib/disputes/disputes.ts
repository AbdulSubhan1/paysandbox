import { addActivity } from '@/lib/payments/activity';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { disputes, payments } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { newId } from '@/lib/ids';
import { enqueueJob, type JobHandler } from '@/lib/jobs/jobs';
import { formatPkr } from '@/lib/money';
import { assertTransition } from '@/lib/payments/state';

export const DISPUTE_RESPOND_DAYS = 7;
export const DISPUTE_CARD_DELAY_SECONDS = 60;
export type DisputeRow = typeof disputes.$inferSelect;

export class DisputeError extends Error {
  name = 'DisputeError';
  constructor(
    public code: 'not_found' | 'payment_not_disputable' | 'dispute_exists' | 'dispute_closed',
    message: string,
  ) {
    super(message);
  }
}

export function toDisputeObject(row: DisputeRow) {
  return {
    id: row.id,
    object: 'dispute' as const,
    amount: row.amount,
    currency: 'pkr' as const,
    payment: row.paymentId,
    reason: row.reason,
    status: row.status,
    respond_by: Math.floor(row.respondBy.getTime() / 1000),
    created: Math.floor(row.createdAt.getTime() / 1000),
    livemode: false as const,
  };
}

/** Opens the payment's one dispute for the amount left; it is lost automatically if not answered in 7 days. */
export async function openDispute(db: Db, d: { merchantId: string; paymentId: string; reason: string; now: Date }): Promise<DisputeRow> {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, d.paymentId), eq(payments.merchantId, d.merchantId)))
      .for('update');
    if (!payment) throw new DisputeError('not_found', 'No such payment.');
    const [existing] = await tx.select({ id: disputes.id }).from(disputes).where(eq(disputes.paymentId, payment.id));
    if (existing) throw new DisputeError('dispute_exists', 'This payment has already been disputed.');
    if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded')
      throw new DisputeError('payment_not_disputable', `A ${payment.status} payment cannot be disputed.`);
    assertTransition(payment.status, 'disputed');

    const amount = payment.amount - payment.amountRefunded;
    const respondBy = new Date(d.now.getTime() + DISPUTE_RESPOND_DAYS * 86_400_000);
    const [dispute] = await tx
      .insert(disputes)
      .values({ id: newId('dp'), merchantId: d.merchantId, paymentId: payment.id, amount, reason: d.reason, previousPaymentStatus: payment.status, respondBy, createdAt: d.now })
      .returning();
    await tx.update(payments).set({ status: 'disputed', updatedAt: d.now }).where(eq(payments.id, payment.id));
    await addActivity(
      tx,
      [{ checkoutSessionId: payment.checkoutSessionId, paymentId: payment.id, kind: 'dispute_opened', message: `Disputed: ${formatPkr(amount)} on hold`, detail: { dispute: dispute.id, reason: d.reason } }],
      d.now,
    );
    await recordEvent(tx, { merchantId: d.merchantId, type: 'dispute.created', payload: toDisputeObject(dispute), now: d.now });
    await enqueueJob(tx, { merchantId: d.merchantId, kind: 'dispute_deadline', refId: dispute.id, runAt: respondBy, now: d.now });
    return dispute;
  });
}

/** Won: the payment goes back to its status before the dispute. Lost: dispute_lost. */
export async function closeDispute(
  db: Db,
  d: { merchantId: string; disputeId: string; outcome: 'won' | 'lost'; now: Date },
): Promise<DisputeRow> {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [dispute] = await tx
      .select()
      .from(disputes)
      .where(and(eq(disputes.id, d.disputeId), eq(disputes.merchantId, d.merchantId)))
      .for('update');
    if (!dispute) throw new DisputeError('not_found', 'No such dispute.');
    if (dispute.status !== 'needs_response') throw new DisputeError('dispute_closed', `This dispute was already ${dispute.status}.`);
    const [payment] = await tx.select().from(payments).where(eq(payments.id, dispute.paymentId)).for('update');
    const status = d.outcome === 'won' ? dispute.previousPaymentStatus : 'dispute_lost';
    assertTransition(payment.status, status);

    const [closed] = await tx.update(disputes).set({ status: d.outcome, closedAt: d.now }).where(eq(disputes.id, dispute.id)).returning();
    await tx.update(payments).set({ status, updatedAt: d.now }).where(eq(payments.id, payment.id));
    await addActivity(
      tx,
      [{ checkoutSessionId: payment.checkoutSessionId, paymentId: payment.id, kind: `dispute_${d.outcome}`, message: d.outcome === 'won' ? 'Dispute won' : 'Dispute lost' }],
      d.now,
    );
    await recordEvent(tx, { merchantId: d.merchantId, type: 'dispute.closed', payload: toDisputeObject(closed), now: d.now });
    return closed;
  });
}

/** Card 0259: opens the dispute a minute after payment. A refund or dispute that got there first ends the job quietly. */
export const openDisputeJob: JobHandler = async (db, job, now) => {
  try {
    await openDispute(db, { merchantId: job.merchantId, paymentId: job.refId, reason: 'fraudulent', now });
  } catch (e) {
    if (!(e instanceof DisputeError)) throw e;
  }
  return { done: true };
};

/** Respond-by passed: an unanswered dispute is lost, like Stripe. */
export const disputeDeadlineJob: JobHandler = async (db, job, now) => {
  try {
    await closeDispute(db, { merchantId: job.merchantId, disputeId: job.refId, outcome: 'lost', now });
  } catch (e) {
    if (!(e instanceof DisputeError)) throw e;
  }
  return { done: true };
};
