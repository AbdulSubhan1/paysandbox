import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, payments } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { effectiveSessionStatus } from '@/lib/sessions/sessions';
import { toPaymentObject } from './objects';
import { DECLINES } from './outcome';
import { addActivity, completePayment, PayError, type PayResult, resultFor } from './pay';

export const TEST_OTP = '123456';
export const MAX_OTP_ATTEMPTS = 3;

export type OtpArgs = { sessionId: string; paymentId: string; code: string } | { sessionId: string; paymentId: string; cancel: true };

export async function submitOtp(db: Db, args: OtpArgs, now: Date): Promise<PayResult> {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [session] = await tx.select().from(checkoutSessions).where(eq(checkoutSessions.id, args.sessionId)).for('update');
    const [payment] = session
      ? await tx.select().from(payments).where(and(eq(payments.id, args.paymentId), eq(payments.checkoutSessionId, session.id)))
      : [];
    if (!session || !payment) throw new PayError('session_not_found', 'This checkout does not exist.');
    if (payment.status !== 'requires_action') return resultFor(payment, session.successUrl); // already finished
    if (effectiveSessionStatus(session, now) === 'expired') throw new PayError('session_expired', 'This checkout has expired.');

    const [customer] = await tx.select().from(customers).where(eq(customers.id, payment.customerId));
    const at = { checkoutSessionId: session.id, paymentId: payment.id };

    if ('code' in args && args.code === TEST_OTP) {
      await addActivity(
        tx,
        [
          { ...at, kind: 'otp_verified', message: 'OTP verified' },
          { ...at, kind: 'authorized', message: 'Authorized by Sandbox Bank' },
          { ...at, kind: 'succeeded', message: 'Payment succeeded' },
        ],
        now,
      );
      return resultFor(await completePayment(tx, payment, customer, now), session.successUrl);
    }

    const attempts = 'code' in args ? payment.otpAttempts + 1 : payment.otpAttempts;
    if ('code' in args && attempts < MAX_OTP_ATTEMPTS) {
      await tx.update(payments).set({ otpAttempts: attempts, updatedAt: now }).where(eq(payments.id, payment.id));
      await addActivity(tx, [{ ...at, kind: 'otp_wrong', message: 'Wrong OTP entered' }], now);
      return { status: 'requires_action', paymentId: payment.id, attemptsLeft: MAX_OTP_ATTEMPTS - attempts };
    }

    const d = DECLINES.authentication_failed;
    const [failed] = await tx
      .update(payments)
      .set({ status: 'failed', otpAttempts: attempts, failureCode: d.code, declineCode: d.declineCode, updatedAt: now })
      .where(eq(payments.id, payment.id))
      .returning();
    await addActivity(
      tx,
      [
        { ...at, kind: 'cancel' in args ? 'otp_cancelled' : 'otp_wrong', message: 'cancel' in args ? 'OTP cancelled' : 'Wrong OTP entered' },
        { ...at, kind: 'failed', message: 'Payment failed', detail: { failure_code: d.code } },
      ],
      now,
    );
    await recordEvent(tx, { merchantId: failed.merchantId, type: 'payment.failed', payload: toPaymentObject(failed, customer), now });
    return resultFor(failed, session.successUrl);
  });
}
