import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { disputes, refunds, webhookDeliveries } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { newId } from '@/lib/ids';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant, makePayment } from '@/test/factories';
import { dailySeries, getOverview, moneyTotals } from './overview';
import { rangeDays, rangeStart, shortDay } from './range';
import { refundedAndDisputed, successfulCaption } from './tiles';

let db: Db;
let a: string;
let b: string;
// 12 Nov 2026, 15:00 in Karachi. The 14-day range starts 30 Oct 00:00 Karachi = 29 Oct 19:00 UTC.
const now = new Date('2026-11-12T10:00:00Z');
const day = (iso: string) => new Date(iso);

async function dispute(merchantId: string, paymentId: string, amount: number, status: 'needs_response' | 'lost', respondBy = now) {
  await db.insert(disputes).values({ id: newId('dp'), merchantId, paymentId, amount, reason: 'fraudulent', status, previousPaymentStatus: 'succeeded', respondBy });
}

async function refund(merchantId: string, paymentId: string, amount: number) {
  await db.insert(refunds).values({ id: newId('re'), merchantId, paymentId, amount, reason: 'requested_by_customer' });
}

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  b = (await makeMerchant(db)).id;
  // In range
  await makePayment(db, a, { amount: 510000, status: 'succeeded', createdAt: day('2026-11-12T08:00:00Z') });
  const part = await makePayment(db, a, { amount: 200000, status: 'partially_refunded', amountRefunded: 50000, createdAt: day('2026-11-11T19:30:00Z') }); // 12 Nov in Karachi
  await refund(a, part.id, 20000);
  await refund(a, part.id, 30000);
  const full = await makePayment(db, a, { amount: 100000, status: 'refunded', amountRefunded: 100000, createdAt: day('2026-11-05T10:00:00Z') });
  await refund(a, full.id, 100000);
  await makePayment(db, a, { amount: 300000, status: 'failed', createdAt: day('2026-11-05T11:00:00Z') });
  await makePayment(db, a, { amount: 150000, status: 'requires_action', createdAt: day('2026-11-06T10:00:00Z') });
  const lost = await makePayment(db, a, { amount: 400000, status: 'dispute_lost', createdAt: day('2026-10-30T10:00:00Z') });
  await dispute(a, lost.id, 400000, 'lost');
  const open = await makePayment(db, a, { amount: 250000, status: 'disputed', createdAt: day('2026-11-01T10:00:00Z') });
  await dispute(a, open.id, 250000, 'needs_response', day('2026-11-18T10:00:00Z'));
  // Before the range: left out of the money, but its open dispute still needs an answer
  const old = await makePayment(db, a, { amount: 900000, status: 'disputed', createdAt: day('2026-10-20T10:00:00Z') });
  await dispute(a, old.id, 900000, 'needs_response', day('2026-11-15T10:00:00Z'));
  await makePayment(db, a, { amount: 777700, status: 'failed', createdAt: day('2026-10-29T18:59:00Z') }); // 29 Oct, 23:59 in Karachi
  // Another project
  await makePayment(db, b, { amount: 999900, status: 'succeeded', createdAt: now });
});

describe('getOverview (PS-DB-001, PS-RF-009)', () => {
  it('adds up only this project and range, and the tiles agree: net = successful − (refunded + lost)', async () => {
    const o = await getOverview(db, a, '14d', now);
    expect(o.successful).toEqual({ amount: 510000 + 200000 + 100000 + 400000 + 250000, count: 5, rate: 5 / 6 });
    expect(o.refunded).toEqual({ amount: 150000, count: 3 });
    expect(o.disputesLost).toEqual({ amount: 400000, count: 1 });
    expect(o.disputesOpen).toEqual({ amount: 250000, count: 1 });
    expect(o.netVolume).toBe(1460000 - 150000 - 400000);
    expect(o.netVolume).toBe(o.successful.amount - refundedAndDisputed(o).amount);
    expect(o.allTime).toBe(9);
    expect(o.recentPayments).toHaveLength(5);
    expect(o.recentPayments.every((p) => p.merchantId === a && p.description === 'Developer hoodie')).toBe(true);
  });

  it('draws one bar per Karachi day that sums to the successful total', async () => {
    const o = await getOverview(db, a, '14d', now);
    expect(o.daily).toHaveLength(14);
    expect(o.daily[0].day).toBe('2026-10-30');
    expect(o.daily.at(-1)).toEqual({ day: '2026-11-12', amount: 510000 + 200000 });
    expect(o.daily.find((d) => d.day === '2026-11-05')?.amount).toBe(100000);
    expect(o.daily.reduce((n, d) => n + d.amount, 0)).toBe(o.successful.amount);
  });

  it('counts what needs attention; open disputes regardless of the range, with the earliest deadline', async () => {
    await makeEndpoint(db, a);
    const failing = await recordEvent(db, { merchantId: a, type: 'payment.succeeded', payload: { id: 'pay_x' }, now });
    const retrying = await recordEvent(db, { merchantId: a, type: 'payment.failed', payload: { id: 'pay_y' }, now });
    await recordEvent(db, { merchantId: a, type: 'payment.succeeded', payload: { id: 'pay_z' }, now }); // still pending, never tried
    await db.update(webhookDeliveries).set({ state: 'failed', attemptCount: 6 }).where(eq(webhookDeliveries.eventId, failing));
    await db.update(webhookDeliveries).set({ attemptCount: 2 }).where(eq(webhookDeliveries.eventId, retrying));

    const o = await getOverview(db, a, '14d', now);
    expect(o.attention).toEqual({ openDisputes: 2, respondBy: day('2026-11-15T10:00:00Z'), failingWebhooks: 2, waitingOtp: 1, declines: 1 });
  });

  it('a shorter range leaves older payments out', async () => {
    const o = await getOverview(db, a, '7d', now);
    expect(o.successful.amount).toBe(510000 + 200000); // 6 to 12 Nov
    expect(o.daily).toHaveLength(7);
  });

  it('is all zeros for a new project (PS-DB-005)', async () => {
    const o = await getOverview(db, (await makeMerchant(db)).id, '30d', now);
    expect(o.netVolume).toBe(0);
    expect(o.allTime).toBe(0);
    expect(o.successful.rate).toBeNull();
    expect(o.daily.every((d) => d.amount === 0)).toBe(true);
    expect(o.recentPayments).toEqual([]);
  });
});

describe('overview arithmetic', () => {
  it('moneyTotals: attempts are captured plus declined; waiting-for-OTP payments are neither', () => {
    const t = moneyTotals(
      [
        { status: 'succeeded', count: 3, amount: 300, refunded: 0 },
        { status: 'refunded', count: 1, amount: 100, refunded: 100 },
        { status: 'failed', count: 4, amount: 999, refunded: 0 },
        { status: 'requires_action', count: 9, amount: 999, refunded: 0 },
      ],
      [{ status: 'won', count: 1, amount: 50 }],
      1,
    );
    expect(t.successful).toEqual({ amount: 400, count: 4, rate: 0.5 });
    expect(t.netVolume).toBe(300); // a won dispute takes nothing away
  });

  it('dailySeries fills empty days with zero, in range order', () => {
    expect(dailySeries(['2026-11-10', '2026-11-11', '2026-11-12'], [{ day: '2026-11-11', amount: 5 }])).toEqual([
      { day: '2026-11-10', amount: 0 },
      { day: '2026-11-11', amount: 5 },
      { day: '2026-11-12', amount: 0 },
    ]);
  });

  it('ranges are whole Karachi days ending today', () => {
    expect(rangeDays('7d', now)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    expect(rangeStart('14d', now).toISOString()).toBe('2026-10-29T19:00:00.000Z');
    expect(rangeDays('7d', new Date('2026-11-12T19:30:00Z')).at(-1)).toBe('2026-11-13'); // after Karachi midnight
    expect(shortDay('2026-10-30')).toBe('30 Oct');
  });

  it('tile captions', () => {
    expect(successfulCaption({ amount: 1, count: 12, rate: 0.857 })).toBe('12 payments · 86% of attempts');
    expect(successfulCaption({ amount: 0, count: 0, rate: null })).toBe('0 payments');
    const zero = { amount: 0, count: 0 };
    expect(refundedAndDisputed({ refunded: zero, disputesLost: zero, disputesOpen: zero })).toEqual({ amount: 0, caption: 'none in this range' });
    expect(
      refundedAndDisputed({ refunded: { amount: 150, count: 2 }, disputesLost: { amount: 400, count: 1 }, disputesOpen: { amount: 250, count: 1 } }),
    ).toEqual({ amount: 550, caption: '2 refunds · 1 dispute lost · 1 open dispute on hold' });
  });
});
