import { consumeUsage } from '@/lib/api/usage';
import type { Db } from '@/lib/db/client';
import { toDisputeObject } from '@/lib/disputes/disputes';
import { type EventType, recordEvent } from '@/lib/events/record';
import { toPaymentObject } from '@/lib/payments/objects';
import { toRefundObject } from '@/lib/refunds/refunds';
import { getWebhookEndpoint } from './endpoints';

export { TEST_EVENT_TYPES } from './test-event-types';

const testId = (prefix: string) => `${prefix}_test${'0'.repeat(20)}`;

/** A sample object of the right shape for each event type, built with the same serializers as real events. */
function sampleObject(type: EventType, now: Date): object {
  const payment = {
    id: testId('pay'),
    merchantId: '',
    checkoutSessionId: testId('cs_test'),
    customerId: testId('cus'),
    attemptId: 'test',
    amount: 510000,
    amountRefunded: 0,
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
    amount: 510000,
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
      return toRefundObject({ id: testId('re'), merchantId: '', paymentId: payment.id, amount: 510000, reason: 'requested_by_customer', status: 'succeeded', createdAt: now });
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
  if (!(await consumeUsage(db, merchantId, 'test_events', now)).allowed) return { ok: false, reason: 'daily_limit' };
  return { ok: true, eventId: await recordEvent(db, { merchantId, type, payload: sampleObject(type, now), now }) };
}
