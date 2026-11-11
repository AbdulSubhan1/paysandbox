import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getSessionRoute } from '@/app/api/v1/checkout_sessions/[id]/route';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, events, jobs, paymentActivity, payments } from '@/lib/db/schema';
import { createMerchant } from '@/lib/merchants/merchants';
import { DECLINES } from '@/lib/payments/outcome';
import { addHours } from '@/lib/time';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment, makeSession, makeUser } from '@/test/factories';
import { expireSession } from './expire';
import { createCheckoutSession } from './sessions';

const now = new Date('2026-11-11T10:00:00Z');
let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

const session = async (id: string) => (await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, id)))[0];

describe('session expiry timer', () => {
  it('schedules one expire_session job at expires_at when a session is created', async () => {
    const row = await createCheckoutSession(
      { db, merchantId, now, requestId: 'req_1', idempotencyKey: null },
      { amount: 510000, currency: 'pkr', lineItems: [{ name: 'Hoodie', quantity: 1, amount: 510000 }], successUrl: 'https://s.test/ok', cancelUrl: 'https://s.test/no', customerEmail: null },
    );
    expect(await db.select().from(jobs)).toEqual([expect.objectContaining({ kind: 'expire_session', refId: row.id, runAt: addHours(now, 24) })]);
  });

  it('expires an open session and fails its pending OTP payment', async () => {
    const s = await makeSession(db, merchantId, { expiresAt: addHours(now, 24) });
    const p = await makePayment(db, merchantId, { checkoutSessionId: s.id, status: 'requires_action', testCard: 'three_ds', cardLast4: '3220' });
    expect(await expireSession(db, s.id, addHours(now, 24))).toEqual({ done: true });
    expect((await session(s.id)).status).toBe('expired');
    const [failed] = await db.select().from(payments).where(eq(payments.id, p.id));
    const d = DECLINES.authentication_failed;
    expect(failed).toMatchObject({ status: 'failed', failureCode: d.code, declineCode: d.declineCode });
    const evts = await db.select().from(events).where(eq(events.type, 'payment.failed'));
    expect(evts).toHaveLength(1);
    expect(evts[0].payload).toMatchObject({ id: p.id, status: 'failed' });
    const acts = await db.select().from(paymentActivity).where(and(eq(paymentActivity.paymentId, p.id), eq(paymentActivity.kind, 'session_expired')));
    expect(acts).toHaveLength(1);
  });

  it('leaves a paid session alone', async () => {
    const s = await makeSession(db, merchantId, { expiresAt: addHours(now, 24), status: 'complete' });
    await expireSession(db, s.id, addHours(now, 24));
    expect((await session(s.id)).status).toBe('complete');
  });

  it('does nothing before expires_at, or for a missing session', async () => {
    const s = await makeSession(db, merchantId, { expiresAt: addHours(now, 24) });
    expect(await expireSession(db, s.id, addHours(now, 23))).toEqual({ done: true });
    expect((await session(s.id)).status).toBe('open');
    expect(await expireSession(db, 'cs_test_missing', now)).toEqual({ done: true });
  });

  it('still never writes on read: an expired-by-time session reads as expired but stays open', async () => {
    const user = await makeUser(db);
    const m = await createMerchant(db, user.id, 'Read Shop');
    const s = await makeSession(db, m.merchant.id, { expiresAt: new Date(Date.now() - 1000) });
    const res = await callRoute(getSessionRoute, { key: m.secretKey, path: `/api/v1/checkout_sessions/${s.id}`, params: { id: s.id } });
    expect(res.json.status).toBe('expired');
    expect((await session(s.id)).status).toBe('open');
    expect(await db.select().from(events)).toHaveLength(0);
  });
});
