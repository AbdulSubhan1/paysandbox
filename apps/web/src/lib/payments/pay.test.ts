import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, events, paymentActivity, payments } from '@/lib/db/schema';
import { addHours } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeMerchant, makeSession } from '@/test/factories';
import { type PayInput, payCheckoutSession } from './pay';

let db: Db;
let sessionId: string;
const now = new Date('2026-11-11T10:00:00Z');
let n = 0;
const input = (over: Partial<PayInput> = {}): PayInput => ({
  sessionId,
  attemptId: `attempt-${++n}`,
  email: 'Ayesha@Example.com',
  name: 'Ayesha Khan',
  cardNumber: '4242 4242 4242 4242',
  expiry: '12 / 29',
  ...over,
});
const pay = (over: Partial<PayInput> = {}) => payCheckoutSession(db, input(over), now);

beforeEach(async () => {
  db = await createTestDb();
  const m = await makeMerchant(db);
  sessionId = (await makeSession(db, m.id, { expiresAt: addHours(now, 24), createdAt: now })).id;
});

describe('payCheckoutSession outcomes (PS-CO-001…008, PS-3DS-001)', () => {
  it.each([
    ['4242424242424242', 'succeeded', null, null, 'payment.succeeded'],
    ['5555555555554444', 'succeeded', null, null, 'payment.succeeded'],
    ['4000000000009995', 'failed', 'card_declined', 'insufficient_funds', 'payment.failed'],
    ['4000000000000069', 'failed', 'expired_card', null, 'payment.failed'],
    ['4000000000000002', 'failed', 'card_declined', 'generic_decline', 'payment.failed'],
    ['4000000000000127', 'failed', 'incorrect_cvc', null, 'payment.failed'],
    ['4000000000000119', 'failed', 'processing_error', null, 'payment.failed'],
    ['4000000000003220', 'requires_action', null, null, 'payment.requires_action'],
    ['4000000000000259', 'succeeded', null, null, 'payment.succeeded'],
  ])('card %s → %s', async (card, status, code, decline, eventType) => {
    const result = await pay({ cardNumber: card });
    expect(result.status).toBe(status);
    expect(result.failure?.code ?? null).toBe(code);
    expect(result.failure?.declineCode ?? null).toBe(decline);
    const [event] = await db.select().from(events);
    expect(event.type).toBe(eventType);
    expect(event.payload).toMatchObject({ id: result.paymentId, object: 'payment', status, livemode: false });
  });

  it('completes the session and returns the success_url with pay=', async () => {
    const result = await pay();
    expect(result.returnUrl).toBe(`https://my-store.test/thanks?pay=${result.paymentId}`);
    const [s] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
    expect(s).toMatchObject({ status: 'complete', paymentId: result.paymentId });
  });

  it('writes the timeline', async () => {
    const result = await pay();
    const rows = await db.select().from(paymentActivity).where(eq(paymentActivity.paymentId, result.paymentId)).orderBy(paymentActivity.seq);
    expect(rows.map((r) => r.message)).toEqual(['Customer submitted card', 'Authorized by Sandbox Bank', 'Payment succeeded']);
  });

  it('saves the customer once per email, lowercased', async () => {
    await pay({ cardNumber: '4000000000009995' });
    await pay({ email: 'ayesha@example.com' });
    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ayesha@example.com');
  });
});

describe('payCheckoutSession safety', () => {
  it('refuses a real-looking card before touching the database (PS-CG-012)', async () => {
    await expect(pay({ cardNumber: '5398228347291056' })).rejects.toMatchObject({ code: 'card_not_test_card' });
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it('stores only brand, last 4 and the test-card key (PS-CG-013)', async () => {
    await pay();
    const [row] = await db.select().from(payments);
    expect(row).toMatchObject({ cardBrand: 'visa', cardLast4: '4242', testCard: 'visa_success' });
    expect(JSON.stringify(row)).not.toMatch(/4242424242424242|12 \/ 29|"2029"/);
  });

  it.each([
    [{ email: 'nope' }, 'email'],
    [{ name: ' ' }, 'name'],
    [{ expiry: '10/26' }, 'expiry'],
  ])('refuses invalid %j', async (over, field) => {
    await expect(pay(over)).rejects.toMatchObject({ code: 'invalid_field', field });
  });
});

describe('payCheckoutSession and the session', () => {
  it('lets the customer try another card after a decline; both payments stay (PS-CO-009)', async () => {
    expect((await pay({ cardNumber: '4000000000009995' })).status).toBe('failed');
    expect((await pay()).status).toBe('succeeded');
    expect(await db.select().from(payments)).toHaveLength(2);
  });

  it('returns the same payment for a repeated attempt id (Review Focus 1)', async () => {
    const first = await pay({ attemptId: 'same' });
    const retry = await pay({ attemptId: 'same' });
    expect(retry).toEqual(first);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it('refuses a second payment after success, e.g. from another tab (Review Focus 2, PS-RD-003)', async () => {
    await pay();
    await expect(pay()).rejects.toMatchObject({ code: 'session_complete' });
  });

  it('returns the pending OTP payment instead of stranding the customer (PS-CO-011, PS-3DS-005)', async () => {
    const pending = await pay({ cardNumber: '4000000000003220' });
    const again = await pay();
    expect(again).toEqual({ status: 'requires_action', paymentId: pending.paymentId });
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it('stops after 10 payment attempts on one checkout', async () => {
    for (let i = 0; i < 10; i++) expect((await pay({ cardNumber: '4000000000009995' })).status).toBe('failed');
    await expect(pay({ cardNumber: '4000000000009995' })).rejects.toMatchObject({ code: 'too_many_attempts' });
  });

  it('refuses an expired session (PS-RD-004)', async () => {
    await db.update(checkoutSessions).set({ expiresAt: addHours(now, -1) }).where(eq(checkoutSessions.id, sessionId));
    await expect(pay()).rejects.toMatchObject({ code: 'session_expired' });
  });

  it('refuses an unknown session', async () => {
    await expect(pay({ sessionId: 'cs_test_nope' })).rejects.toMatchObject({ code: 'session_not_found' });
  });
});

describe('currency', () => {
  it("records the payment in the checkout's currency and sends it in the event", async () => {
    const m = await makeMerchant(db, { currency: 'usd' });
    sessionId = (await makeSession(db, m.id, { currency: 'usd', amount: 29999, expiresAt: addHours(now, 24), createdAt: now })).id;
    await pay();
    const [p] = await db.select().from(payments).where(eq(payments.checkoutSessionId, sessionId));
    expect(p.currency).toBe('usd');
    const [e] = await db.select().from(events).where(eq(events.type, 'payment.succeeded'));
    expect(e.payload).toMatchObject({ amount: 29999, currency: 'usd' });
  });
});
