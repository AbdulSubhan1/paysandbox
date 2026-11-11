import { consumeUsage } from '@/lib/api/usage';
import { eq } from 'drizzle-orm';
import type { Currency } from '@/lib/currency';
import type { Db } from '@/lib/db/client';
import { merchants } from '@/lib/db/schema';
import { toDisputeObject } from '@/lib/disputes/disputes';
import { type EventType, recordEvent } from '@/lib/events/record';
import { toPaymentObject } from '@/lib/payments/objects';
import { toRefundObject } from '@/lib/refunds/refunds';
import { getWebhookEndpoint } from './endpoints';

export { TEST_EVENT_TYPES } from './test-event-types';

const testId = (prefix: string) => `${prefix}_test${'0'.repeat(20)}`;

/**
 * A sample object of the right shape for each event type, built with the same serializers as real events, in the
 * project's currency (PKR 5,100.00, or 29.99 in other currencies).
 */
function sampleObject(type: EventType, now: Date, currency: Currency): object {
  const amount = currency === 'pkr' ? 510000 : 2999;
  const payment = {
    id: testId('pay'),
    merchantId: '',
    checkoutSessionId: testId('cs_test'),
    customerId: testId('cus'),
    attemptId: 'test',
    amount,
    amountRefunded: 0,
    currency,
    status: 'succeeded' as const,
    cardBrand: 'visa',
    cardLast4: '4242',
    testCard: 'visa_success',
    failureCode: null,
    declineCode: null,
    otpAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  const customer = { id: testId('cus'), name: 'Ayesha Khan', email: 'ayesha@example.com' };
  const dispute = {
    id: testId('dp'),
    merchantId: '',
    paymentId: payment.id,
    amount,
    currency,
    reason: 'fraudulent',
    status: 'needs_response' as const,
    previousPaymentStatus: 'succeeded' as const,
    respondBy: new Date(now.getTime() + 7 * 86_400_000),
    createdAt: now,
    closedAt: null,
  };
  switch (type) {
    case 'payment.succeeded':
      return toPaymentObject(payment, customer);
    case 'payment.failed':
      return toPaymentObject({ ...payment, status: 'failed', failureCode: 'card_declined', declineCode: 'insufficient_funds' }, customer);
    case 'payment.requires_action':
      return toPaymentObject({ ...payment, status: 'requires_action' }, customer);
    case 'refund.created':
      return toRefundObject({ id: testId('re'), merchantId: '', paymentId: payment.id, amount, currency, reason: 'requested_by_customer', status: 'succeeded', createdAt: now });
    case 'dispute.created':
      return toDisputeObject(dispute);
    case 'dispute.closed':
      return toDisputeObject({ ...dispute, status: 'won', closedAt: now });
  }
}

/** "Send test event": a real, signed event with a sample object, counted against the 50-a-day cap. */
export async function sendTestEvent(
  db: Db,
  merchantId: string,
  type: EventType,
  now: Date,
): Promise<{ ok: true; eventId: string } | { ok: false; reason: 'no_endpoint' | 'daily_limit' }> {
  const endpoint = await getWebhookEndpoint(db, merchantId);
  if (!endpoint?.enabled) return { ok: false, reason: 'no_endpoint' };
  // One transaction: if recording the event fails, the test event isn't counted against the daily cap either.
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    if (!(await consumeUsage(tx, merchantId, 'test_events', now)).allowed) return { ok: false, reason: 'daily_limit' } as const;
    const [{ currency }] = await tx.select({ currency: merchants.currency }).from(merchants).where(eq(merchants.id, merchantId));
    return { ok: true, eventId: await recordEvent(tx, { merchantId, type, payload: sampleObject(type, now, currency), now }) } as const;
  });
}
