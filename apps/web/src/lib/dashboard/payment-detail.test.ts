import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { openDispute } from '@/lib/disputes/disputes';
import { submitOtp } from '@/lib/payments/otp';
import { payCheckoutSession } from '@/lib/payments/pay';
import { createRefund } from '@/lib/refunds/refunds';
import { createTestDb } from '@/test/db';
import { createCheckoutSession } from '@/lib/sessions/sessions';
import { makeMerchant, makePayment } from '@/test/factories';
import { getPaymentDetail } from './payment-detail';

const t = (m: number) => new Date(Date.UTC(2026, 10, 11, 10, m));
let db: Db;
let a: string;
let paymentId: string;

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  const s = await createCheckoutSession(
    { db, merchantId: a, now: t(0), requestId: 'req_1', idempotencyKey: null, currency: 'pkr' },
    { amount: 510000, currency: 'pkr', lineItems: [{ name: 'Hoodie', quantity: 1, amount: 510000 }], successUrl: 'https://s.test/ok', cancelUrl: 'https://s.test/no', customerEmail: null },
  );
  const pay = (await payCheckoutSession(db, { sessionId: s.id, attemptId: 'a1', email: 'a@x.pk', name: 'Ayesha', cardNumber: '4000000000003220', expiry: '12/29' }, t(1))).paymentId;
  await submitOtp(db, { sessionId: s.id, paymentId: pay, code: '123456' }, t(2));
  await createRefund(db, { merchantId: a, paymentId: pay, amount: 100000, reason: 'duplicate', now: t(3) });
  await openDispute(db, { merchantId: a, paymentId: pay, reason: 'product_not_received', now: t(4) });
  paymentId = pay;
  await makePayment(db, a); // another payment of the same merchant, with no events
});

describe('getPaymentDetail (PS-DB-003)', () => {
  it('lists the timeline in time order, rows at the same moment in insert order', async () => {
    const d = (await getPaymentDetail(db, a, paymentId))!;
    expect(d.timeline.map((r) => r.kind)).toEqual([
      'session_created',
      'card_submitted',
      'otp_requested',
      'otp_verified',
      'authorized',
      'succeeded',
      'refunded',
      'dispute_opened',
    ]);
    expect(d.amountLeft).toBe(410000);
    expect(d.refunds.map((r) => r.amount)).toEqual([100000]);
    expect(d.dispute).toMatchObject({ amount: 410000, status: 'needs_response' });
    expect(d.customer.name).toBe('Ayesha');
  });

  it("shows this payment's events and nobody else's", async () => {
    const d = (await getPaymentDetail(db, a, paymentId))!;
    expect(d.events.map((e) => e.type)).toEqual(['dispute.created', 'refund.created', 'payment.succeeded', 'payment.requires_action']);
  });

  it("is null for another merchant's payment (Plan 3 Review Focus 1)", async () => {
    const b = (await makeMerchant(db)).id;
    expect(await getPaymentDetail(db, b, paymentId)).toBeNull();
    expect(await getPaymentDetail(db, a, 'pay_missing')).toBeNull();
  });
});
