import { addActivity } from '@/lib/payments/activity';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, payments } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import type { JobHandler, JobOutcome } from '@/lib/jobs/jobs';
import { toPaymentObject } from '@/lib/payments/objects';
import { DECLINES } from '@/lib/payments/outcome';
import { assertTransition } from '@/lib/payments/state';

/** The expire_session timer: an open session past expires_at expires, and any payment waiting for OTP fails. */
export async function expireSession(db: Db, sessionId: string, now: Date): Promise<JobOutcome> {
  await db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [session] = await tx.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId)).for('update');
    if (!session || session.status !== 'open' || session.expiresAt > now) return;
    await tx.update(checkoutSessions).set({ status: 'expired' }).where(eq(checkoutSessions.id, sessionId));

    const pending = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.checkoutSessionId, sessionId), eq(payments.status, 'requires_action')));
    const d = DECLINES.authentication_failed;
    for (const p of pending) {
      assertTransition(p.status, 'failed');
      const [failed] = await tx
        .update(payments)
        .set({ status: 'failed', failureCode: d.code, declineCode: d.declineCode, updatedAt: now })
        .where(eq(payments.id, p.id))
        .returning();
      const [customer] = await tx.select().from(customers).where(eq(customers.id, p.customerId));
      await addActivity(
        tx,
        [
          { checkoutSessionId: sessionId, paymentId: p.id, kind: 'session_expired', message: 'Session expired before OTP' },
          { checkoutSessionId: sessionId, paymentId: p.id, kind: 'failed', message: 'Payment failed', detail: { failure_code: d.code } },
        ],
        now,
      );
      await recordEvent(tx, { merchantId: failed.merchantId, type: 'payment.failed', payload: toPaymentObject(failed, customer), now });
    }
  });
  return { done: true };
}

export const expireSessionJob: JobHandler = (db, job, now) => expireSession(db, job.refId, now);
