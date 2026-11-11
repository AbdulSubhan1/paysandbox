import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { disputes } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { recordEvent } from '@/lib/events/record';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment } from '@/test/factories';
import { getOverview } from './overview';

let db: Db;
let a: string;
let b: string;
const now = new Date('2026-11-11T10:00:00Z');

async function dispute(merchantId: string, paymentId: string, amount: number, status: 'needs_response' | 'lost') {
  await db.insert(disputes).values({ id: newId('dp'), merchantId, paymentId, amount, reason: 'fraudulent', status, previousPaymentStatus: 'succeeded', respondBy: now });
}

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  b = (await makeMerchant(db)).id;
  await makePayment(db, a, { amount: 510000, status: 'succeeded' });
  await makePayment(db, a, { amount: 200000, status: 'partially_refunded', amountRefunded: 50000 });
  await makePayment(db, a, { amount: 100000, status: 'refunded', amountRefunded: 100000 });
  await makePayment(db, a, { amount: 300000, status: 'failed' });
  await makePayment(db, a, { amount: 150000, status: 'requires_action' });
  const lost = await makePayment(db, a, { amount: 400000, status: 'dispute_lost' });
  await dispute(a, lost.id, 400000, 'lost');
  const open = await makePayment(db, a, { amount: 250000, status: 'disputed' });
  await dispute(a, open.id, 250000, 'needs_response');
  await makePayment(db, b, { amount: 999900, status: 'succeeded' });
  await recordEvent(db, { merchantId: a, type: 'payment.succeeded', payload: { id: 'pay_x' }, now });
});

describe('getOverview (PS-DB-001, PS-RF-009)', () => {
  it('adds up only this merchant, with net = succeeded volume − refunded − lost disputes', async () => {
    const o = await getOverview(db, a);
    expect(o.netVolume).toBe(510000 + 200000 + 100000 + 400000 + 250000 - 50000 - 100000 - 400000);
    expect(o.netVolume).toBe(910000);
    expect(o.succeeded).toEqual({ amount: 510000, count: 1 });
    expect(o.refunded).toEqual({ amount: 150000, count: 2 });
    expect(o.failed).toEqual({ amount: 300000, count: 1 });
    expect(o.needsOtp).toEqual({ amount: 150000, count: 1 });
    expect(o.disputed).toEqual({ amount: 650000, count: 2 });
    expect(o.statusCounts).toEqual({ succeeded: 1, partially_refunded: 1, refunded: 1, failed: 1, requires_action: 1, dispute_lost: 1, disputed: 1 });
    expect(o.recentPayments).toHaveLength(5);
    expect(o.recentPayments.every((p) => p.merchantId === a)).toBe(true);
    expect(o.recentEvents.map((e) => e.type)).toEqual(['payment.succeeded']);
    expect(o.recentEvents[0].delivery).toBeNull();
  });

  it('is all zeros for a new project (PS-DB-005)', async () => {
    const empty = (await makeMerchant(db)).id;
    const o = await getOverview(db, empty);
    expect(o.netVolume).toBe(0);
    expect(o.statusCounts).toEqual({});
    expect(o.recentPayments).toEqual([]);
  });
});
