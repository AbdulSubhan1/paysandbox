import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, events, paymentActivity } from '@/lib/db/schema';
import { addHours } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeMerchant, makeSession } from '@/test/factories';
import { submitOtp } from './otp';
import { payCheckoutSession } from './pay';

let db: Db;
let sessionId: string;
let paymentId: string;
const now = new Date('2026-11-11T10:00:00Z');

beforeEach(async () => {
  db = await createTestDb();
  const m = await makeMerchant(db);
  sessionId = (await makeSession(db, m.id, { expiresAt: addHours(now, 24), createdAt: now })).id;
  const result = await payCheckoutSession(
    db,
    { sessionId, attemptId: 'a1', email: 'a@x.pk', name: 'A', cardNumber: '4000000000003220', expiry: '12/29' },
    now,
  );
  paymentId = result.paymentId;
});

const types = async () => (await db.select().from(events).orderBy(events.createdAt)).map((e) => e.type);

describe('submitOtp (PS-3DS-001…006)', () => {
  it('succeeds with 123456', async () => {
    const result = await submitOtp(db, { sessionId, paymentId, code: '123456' }, now);
    expect(result.status).toBe('succeeded');
    expect(result.returnUrl).toContain(`pay=${paymentId}`);
    expect(await types()).toEqual(['payment.requires_action', 'payment.succeeded']);
    const [s] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
    expect(s.status).toBe('complete');
    const messages = (await db.select().from(paymentActivity).where(eq(paymentActivity.paymentId, paymentId)).orderBy(paymentActivity.seq)).map((r) => r.message);
    expect(messages).toEqual([
      'Customer submitted card',
      'OTP requested (3-D Secure)',
      'OTP verified',
      'Authorized by Sandbox Bank',
      'Payment succeeded',
    ]);
  });

  it('allows 2 wrong codes, then fails on the 3rd', async () => {
    expect(await submitOtp(db, { sessionId, paymentId, code: '000000' }, now)).toMatchObject({ status: 'requires_action', attemptsLeft: 2 });
    expect(await submitOtp(db, { sessionId, paymentId, code: '111111' }, now)).toMatchObject({ status: 'requires_action', attemptsLeft: 1 });
    const third = await submitOtp(db, { sessionId, paymentId, code: '222222' }, now);
    expect(third).toMatchObject({ status: 'failed', failure: { code: 'authentication_failed' } });
    expect(await types()).toEqual(['payment.requires_action', 'payment.failed']);
  });

  it('fails when the customer cancels', async () => {
    expect(await submitOtp(db, { sessionId, paymentId, cancel: true }, now)).toMatchObject({
      status: 'failed',
      failure: { code: 'authentication_failed' },
    });
  });

  it('returns the final result again if called after it finished', async () => {
    await submitOtp(db, { sessionId, paymentId, code: '123456' }, now);
    expect((await submitOtp(db, { sessionId, paymentId, code: '000000' }, now)).status).toBe('succeeded');
    expect(await types()).toEqual(['payment.requires_action', 'payment.succeeded']);
  });

  it('refuses a payment from another session', async () => {
    await expect(submitOtp(db, { sessionId: 'cs_test_other', paymentId, code: '123456' }, now)).rejects.toMatchObject({
      code: 'session_not_found',
    });
  });
});
