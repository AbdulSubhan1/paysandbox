import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { Db } from '@/lib/db/client';
import { events, paymentActivity, payments, refunds } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment } from '@/test/factories';
import { parseCreateRefund } from './input';
import { createRefund } from './refunds';

const now = new Date('2026-11-11T10:00:00Z');
let db: Db;
let merchantId: string;
let paymentId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
  paymentId = (await makePayment(db, merchantId)).id;
});

const refund = (amount?: number, id = paymentId, m = merchantId) =>
  createRefund(db, { merchantId: m, paymentId: id, amount, reason: 'requested_by_customer', now });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ApiError ? `${e.status} ${e.code}` : String(e);
  }
  return 'ok';
};
const payment = async () => (await db.select().from(payments).where(eq(payments.id, paymentId)))[0];

describe('createRefund', () => {
  it('refunds in full by default and records refund.created (PS-RF-001)', async () => {
    const { refund: r, payment: p } = await refund();
    expect(r).toMatchObject({ amount: 510000, reason: 'requested_by_customer', status: 'succeeded' });
    expect(r.id).toMatch(/^re_/);
    expect(p).toMatchObject({ status: 'refunded', amountRefunded: 510000 });
    const evts = await db.select().from(events).where(eq(events.type, 'refund.created'));
    expect(evts).toHaveLength(1);
    expect(evts[0].payload).toMatchObject({ id: r.id, object: 'refund', amount: 510000, payment: paymentId, livemode: false });
    expect(await db.select().from(paymentActivity).where(eq(paymentActivity.kind, 'refunded'))).toHaveLength(1);
  });

  it('refunds partly, then the rest (PS-RF-002, PS-RF-004)', async () => {
    expect((await refund(100000)).payment).toMatchObject({ status: 'partially_refunded', amountRefunded: 100000 });
    expect((await refund(410000)).payment).toMatchObject({ status: 'refunded', amountRefunded: 510000 });
    expect(await db.select().from(refunds)).toHaveLength(2);
  });

  it('refuses more than the amount left (PS-RF-003)', async () => {
    await refund(100000);
    expect(await code(refund(410001))).toBe('400 amount_too_large');
    expect((await payment()).amountRefunded).toBe(100000);
  });

  it('refuses failed, pending and disputed payments (PS-RF-006, PS-RF-007)', async () => {
    const failed = await makePayment(db, merchantId, { status: 'failed' });
    const pending = await makePayment(db, merchantId, { status: 'requires_action' });
    const disputed = await makePayment(db, merchantId, { status: 'disputed' });
    expect(await code(refund(undefined, failed.id))).toBe('400 payment_not_refundable');
    expect(await code(refund(undefined, pending.id))).toBe('400 payment_not_refundable');
    expect(await code(refund(undefined, disputed.id))).toBe('400 payment_disputed');
  });

  it("returns 404 for a missing or another merchant's payment", async () => {
    expect(await code(refund(undefined, 'pay_missing'))).toBe('404 resource_missing');
    const other = (await makeMerchant(db)).id;
    expect(await code(refund(undefined, paymentId, other))).toBe('404 resource_missing');
  });

  it('never overspends when two partial refunds race (PS-RF-008)', async () => {
    const results = await Promise.all([code(refund(300000)), code(refund(300000))]);
    expect(results.sort()).toEqual(['400 amount_too_large', 'ok']);
    expect((await payment()).amountRefunded).toBe(300000);
  });
});

describe('parseCreateRefund (PS-RF-005)', () => {
  const err = (body: unknown) => {
    try {
      parseCreateRefund(body);
      return 'ok';
    } catch (e) {
      return e instanceof ApiError ? `${e.code} ${e.param ?? ''}`.trim() : String(e);
    }
  };
  it.each([
    [{ payment: 'pay_1', reason: 'duplicate', amount: 0 }, 'amount_too_small amount'],
    [{ payment: 'pay_1', reason: 'duplicate', amount: -1 }, 'amount_too_small amount'],
    [{ payment: 'pay_1', reason: 'duplicate', amount: 0.5 }, 'amount_not_integer amount'],
    [{ payment: 'pay_1', reason: 'duplicate', amount: '100' }, 'amount_not_integer amount'],
    [{ reason: 'duplicate' }, 'parameter_missing payment'],
    [{ payment: 'pay_1' }, 'parameter_missing reason'],
    [{ payment: 'pay_1', reason: 'because' }, 'parameter_invalid reason'],
    [null, 'parameter_missing payment'],
  ])('%j → %s', (body, expected) => expect(err(body)).toBe(expected));

  it('accepts a body without amount', () => {
    expect(parseCreateRefund({ payment: 'pay_1', reason: 'fraudulent' })).toEqual({ payment: 'pay_1', reason: 'fraudulent' });
  });
});

describe('currency', () => {
  it("refunds in the payment's currency and words the limit in it", async () => {
    const m = (await makeMerchant(db, { currency: 'aed' })).id;
    const p = (await makePayment(db, m, { currency: 'aed', amount: 150000 })).id;
    const { refund: r } = await createRefund(db, { merchantId: m, paymentId: p, amount: 50000, reason: 'requested_by_customer', now });
    expect(r.currency).toBe('aed');
    const [e] = await db.select().from(events).where(eq(events.type, 'refund.created'));
    expect(e.payload).toMatchObject({ currency: 'aed', amount: 50000 });
    await expect(createRefund(db, { merchantId: m, paymentId: p, amount: 200000, reason: 'requested_by_customer', now })).rejects.toThrow('AED 1,000.00');
  });
});
