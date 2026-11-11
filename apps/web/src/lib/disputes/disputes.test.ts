import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { disputes, events, jobs, payments } from '@/lib/db/schema';
import type { JobRow } from '@/lib/jobs/jobs';
import { payCheckoutSession } from '@/lib/payments/pay';
import { createRefund } from '@/lib/refunds/refunds';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment, makeSession } from '@/test/factories';
import { closeDispute, DISPUTE_CARD_DELAY_SECONDS, disputeDeadlineJob, openDispute, openDisputeJob } from './disputes';

const now = new Date('2026-11-11T10:00:00Z');
const plus = (s: number) => new Date(now.getTime() + s * 1000);
const DAY = 86_400;
let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

const payment = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0];
const eventsOf = async (type: string) => db.select().from(events).where(eq(events.type, type));
const asJob = (j: Partial<JobRow>) => ({ merchantId, ...j }) as JobRow;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe('disputes', () => {
  it('card 0259 schedules a dispute 60 s after paying, which then opens', async () => {
    const s = await makeSession(db, merchantId, { expiresAt: plus(DAY) });
    const r = await payCheckoutSession(db, { sessionId: s.id, attemptId: 'a1', email: 'a@x.pk', name: 'A', cardNumber: '4000000000000259', expiry: '12/29' }, now);
    expect(r.status).toBe('succeeded');
    const [job] = await db.select().from(jobs).where(eq(jobs.kind, 'open_dispute'));
    expect(job).toMatchObject({ refId: r.paymentId, runAt: plus(DISPUTE_CARD_DELAY_SECONDS) });
    await openDisputeJob(db, job, plus(61));
    expect((await payment(r.paymentId)).status).toBe('disputed');
    const [created] = await eventsOf('dispute.created');
    expect(created.payload).toMatchObject({ object: 'dispute', amount: 510000, payment: r.paymentId, status: 'needs_response', reason: 'fraudulent' });
  });

  it('opens for the amount left after a partial refund, due in 7 days (PS-DP-002)', async () => {
    const p = await makePayment(db, merchantId);
    await createRefund(db, { merchantId, paymentId: p.id, amount: 100000, reason: 'duplicate', now });
    const d = await openDispute(db, { merchantId, paymentId: p.id, reason: 'product_not_received', now });
    expect(d).toMatchObject({ amount: 410000, status: 'needs_response', previousPaymentStatus: 'partially_refunded', respondBy: plus(7 * DAY) });
    expect(await db.select().from(jobs).where(eq(jobs.kind, 'dispute_deadline'))).toEqual([
      expect.objectContaining({ refId: d.id, runAt: plus(7 * DAY) }),
    ]);
  });

  it('won: the payment returns to its status before the dispute (PS-DP-003)', async () => {
    const p = await makePayment(db, merchantId);
    await createRefund(db, { merchantId, paymentId: p.id, amount: 100000, reason: 'duplicate', now });
    const d = await openDispute(db, { merchantId, paymentId: p.id, reason: 'fraudulent', now });
    const closed = await closeDispute(db, { merchantId, disputeId: d.id, outcome: 'won', now: plus(60) });
    expect(closed).toMatchObject({ status: 'won', closedAt: plus(60) });
    expect((await payment(p.id)).status).toBe('partially_refunded');
    expect((await eventsOf('dispute.closed'))[0].payload).toMatchObject({ id: d.id, status: 'won' });
  });

  it('lost: the payment becomes dispute_lost (PS-DP-004)', async () => {
    const p = await makePayment(db, merchantId);
    const d = await openDispute(db, { merchantId, paymentId: p.id, reason: 'fraudulent', now });
    await closeDispute(db, { merchantId, disputeId: d.id, outcome: 'lost', now });
    expect((await payment(p.id)).status).toBe('dispute_lost');
  });

  it('refuses a second dispute and a second close, changing nothing (PS-DP-005)', async () => {
    const p = await makePayment(db, merchantId);
    const d = await openDispute(db, { merchantId, paymentId: p.id, reason: 'fraudulent', now });
    expect(await code(openDispute(db, { merchantId, paymentId: p.id, reason: 'fraudulent', now }))).toBe('dispute_exists');
    await closeDispute(db, { merchantId, disputeId: d.id, outcome: 'won', now });
    expect(await code(closeDispute(db, { merchantId, disputeId: d.id, outcome: 'lost', now }))).toBe('dispute_closed');
    expect((await payment(p.id)).status).toBe('succeeded');
    expect(await db.select().from(disputes)).toHaveLength(1);
  });

  it('refuses payments that cannot be disputed, and other merchants', async () => {
    const failed = await makePayment(db, merchantId, { status: 'failed' });
    expect(await code(openDispute(db, { merchantId, paymentId: failed.id, reason: 'fraudulent', now }))).toBe('payment_not_disputable');
    const p = await makePayment(db, merchantId);
    const other = (await makeMerchant(db)).id;
    expect(await code(openDispute(db, { merchantId: other, paymentId: p.id, reason: 'fraudulent', now }))).toBe('not_found');
  });

  it('loses an unanswered dispute at the deadline, and leaves a closed one alone (PS-DP-007)', async () => {
    const p = await makePayment(db, merchantId);
    const d = await openDispute(db, { merchantId, paymentId: p.id, reason: 'fraudulent', now });
    expect(await disputeDeadlineJob(db, asJob({ refId: d.id }), plus(7 * DAY))).toEqual({ done: true });
    expect((await payment(p.id)).status).toBe('dispute_lost');
    expect((await eventsOf('dispute.closed'))[0].createdAt).toEqual(plus(7 * DAY));

    const p2 = await makePayment(db, merchantId);
    const d2 = await openDispute(db, { merchantId, paymentId: p2.id, reason: 'fraudulent', now });
    await closeDispute(db, { merchantId, disputeId: d2.id, outcome: 'won', now });
    expect(await disputeDeadlineJob(db, asJob({ refId: d2.id }), plus(7 * DAY))).toEqual({ done: true });
    expect((await payment(p2.id)).status).toBe('succeeded');
  });

  it('a full refund and the 0259 dispute job racing never both win (Review Focus 3)', async () => {
    const p = await makePayment(db, merchantId, { testCard: 'dispute' });
    const [refund, job] = await Promise.all([
      code(createRefund(db, { merchantId, paymentId: p.id, reason: 'requested_by_customer', now })),
      openDisputeJob(db, asJob({ refId: p.id }), now),
    ]);
    expect(job).toEqual({ done: true });
    const after = await payment(p.id);
    const opened = await db.select().from(disputes);
    if (refund === 'ok') {
      expect(after.status).toBe('refunded');
      expect(opened).toHaveLength(0);
    } else {
      expect(refund).toBe('payment_disputed');
      expect(after.status).toBe('disputed');
      expect(opened).toHaveLength(1);
    }
  });

  it('the dispute job ends quietly when the payment was refunded first', async () => {
    const p = await makePayment(db, merchantId);
    await createRefund(db, { merchantId, paymentId: p.id, reason: 'requested_by_customer', now });
    expect(await openDisputeJob(db, asJob({ refId: p.id }), plus(61))).toEqual({ done: true });
    expect(await db.select().from(disputes)).toHaveLength(0);
  });
});


describe('dispute currency', () => {
  it("opens in the payment's currency", async () => {
    const m = (await makeMerchant(db, { currency: 'gbp' })).id;
    const p = (await makePayment(db, m, { currency: 'gbp', amount: 12000 })).id;
    const d = await openDispute(db, { merchantId: m, paymentId: p, reason: 'fraudulent', now: new Date() });
    expect(d.currency).toBe('gbp');
    const [e] = await db.select().from(events).where(eq(events.type, 'dispute.created'));
    expect(e.payload).toMatchObject({ currency: 'gbp', amount: 12000 });
  });
});
