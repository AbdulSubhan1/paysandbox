import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment, makeSession, makeUser } from '@/test/factories';
import type { Db } from './client';
import { customers, disputes, events, jobs, refunds, webhookAttempts, webhookDeliveries, webhookEndpoints } from './schema';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('schema', () => {
  it('stores a checkout session for a merchant', async () => {
    const user = await makeUser(db);
    const m = await makeMerchant(db, { userId: user.id });
    const s = await makeSession(db, m.id, { amount: 510000 });
    expect(s.amount).toBe(510000);
    expect(s.status).toBe('open');
    expect(s.currency).toBe('pkr');
  });

  it('keeps one customer per email per merchant', async () => {
    const m = await makeMerchant(db);
    const row = () => ({ id: newId('cus'), merchantId: m.id, email: 'a@x.pk', name: 'A' });
    await db.insert(customers).values(row());
    await expect(db.insert(customers).values(row())).rejects.toThrow();
  });

  it('creates the Plan 2 tables', async () => {
    const m = await makeMerchant(db);
    const pay = await makePayment(db, m.id);
    expect(pay).toMatchObject({ status: 'succeeded', amount: 510000, testCard: 'visa_success', amountRefunded: 0 });
    const now = new Date();
    const [we] = await db.insert(webhookEndpoints).values({ id: newId('we'), merchantId: m.id, url: 'https://h.example/x', secretEncrypted: 'box' }).returning();
    expect(we).toMatchObject({ enabled: true, consecutiveFailures: 0, disabledReason: null });
    const evtId = newId('evt');
    await db.insert(events).values({ id: evtId, merchantId: m.id, type: 'payment.succeeded', payload: {} });
    const [dlv] = await db
      .insert(webhookDeliveries)
      .values({ id: newId('dlv'), merchantId: m.id, eventId: evtId, endpointId: we.id, nextAttemptAt: now })
      .returning();
    expect(dlv).toMatchObject({ state: 'pending', attemptCount: 0 });
    await expect(
      db.insert(webhookDeliveries).values({ id: newId('dlv'), merchantId: m.id, eventId: evtId, endpointId: we.id }),
    ).rejects.toThrow(); // one delivery per event and endpoint
    await db.insert(webhookAttempts).values({ id: newId('att'), deliveryId: dlv.id, attempt: 1, url: we.url, durationMs: 12, requestHeaders: {} });
    const [re] = await db.insert(refunds).values({ id: newId('re'), merchantId: m.id, paymentId: pay.id, amount: 100000, reason: 'duplicate' }).returning();
    expect(re.status).toBe('succeeded');
    const dispute = { merchantId: m.id, paymentId: pay.id, amount: 410000, reason: 'fraudulent', previousPaymentStatus: 'succeeded' as const, respondBy: now };
    const [dp] = await db.insert(disputes).values({ id: newId('dp'), ...dispute }).returning();
    expect(dp.status).toBe('needs_response');
    await expect(db.insert(disputes).values({ id: newId('dp'), ...dispute })).rejects.toThrow(); // one dispute per payment
    const [job] = await db.insert(jobs).values({ id: newId('job'), merchantId: m.id, kind: 'expire_session', refId: 'cs_test_x', runAt: now }).returning();
    expect(job).toMatchObject({ state: 'pending', attempts: 0, lockedUntil: null, publishedAt: null });
    expect(newId('dp')).toMatch(/^dp_[0-9A-Za-z]{24}$/);
  });
});
