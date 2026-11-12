import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { customers } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import type { PaymentStatus } from '@/lib/payments/state';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment } from '@/test/factories';
import { listDashboardPayments, PAYMENTS_PAGE_SIZE, paymentStatusCounts } from './payments';

let db: Db;
let a: string;
const STATUSES: PaymentStatus[] = ['succeeded', 'failed', 'refunded', 'succeeded'];

async function customer(merchantId: string, email: string) {
  const id = newId('cus');
  await db.insert(customers).values({ id, merchantId, email, name: email.split('@')[0] });
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  const ayesha = await customer(a, 'ayesha@example.com');
  const bilal = await customer(a, 'bilal@example.com');
  for (let i = 0; i < 60; i++) {
    const createdAt = new Date(Date.UTC(2026, 10, 11, 10, Math.floor(i / 3))); // every three share a timestamp
    await makePayment(db, a, { createdAt, status: STATUSES[i % 4], customerId: i % 2 ? ayesha : bilal });
  }
  const b = (await makeMerchant(db)).id;
  await makePayment(db, b, { status: 'succeeded' });
});

async function walk(opts: { status?: PaymentStatus; customerEmail?: string }) {
  const ids: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await listDashboardPayments(db, a, { ...opts, before });
    ids.push(...r.rows.map((p) => p.id));
    expect(r.rows.length).toBeLessThanOrEqual(PAYMENTS_PAGE_SIZE);
    if (!r.next) return ids;
    before = r.next;
  }
  throw new Error('paging never ended');
}

describe('listDashboardPayments', () => {
  it('pages through rows that share a timestamp, each exactly once, newest first (Plan 3 Review Focus 3)', async () => {
    const all = await walk({});
    expect(all).toHaveLength(60);
    expect(new Set(all).size).toBe(60);
    const filtered = await walk({ status: 'succeeded', customerEmail: 'ayesha@example.com' });
    expect(new Set(filtered).size).toBe(filtered.length);
    const first = await listDashboardPayments(db, a, { status: 'succeeded', customerEmail: 'ayesha@example.com' });
    expect(first.rows.every((p) => p.status === 'succeeded' && p.customerEmail === 'ayesha@example.com')).toBe(true);
    expect(filtered.length).toBe((await paymentStatusCounts(db, a, { customerEmail: 'ayesha@example.com' })).succeeded);
  });

  it('chip counts equal the rows each chip shows (PS-DB-002)', async () => {
    const counts = await paymentStatusCounts(db, a, {});
    expect(counts.all).toBe(60);
    for (const s of ['succeeded', 'failed', 'refunded'] as const) expect((await walk({ status: s })).length).toBe(counts[s]);
  });

  it("never shows another merchant's payments, and a bad cursor gives page 1", async () => {
    expect((await walk({})).length).toBe(60);
    const bad = await listDashboardPayments(db, a, { before: 'garbage' });
    const first = await listDashboardPayments(db, a, {});
    expect(bad.rows.map((p) => p.id)).toEqual(first.rows.map((p) => p.id));
  });

  it('says where a page is ("Showing 26–50 of 60") and pages back with Previous to the same rows', async () => {
    const p1 = await listDashboardPayments(db, a, {});
    expect([p1.from, p1.rows.length, p1.total, p1.prev]).toEqual([1, 25, 60, null]);
    const p2 = await listDashboardPayments(db, a, { before: p1.next! });
    expect([p2.from, p2.rows.length]).toEqual([26, 25]);
    const p3 = await listDashboardPayments(db, a, { before: p2.next! });
    expect([p3.from, p3.rows.length, p3.next]).toEqual([51, 10, null]);
    const back = await listDashboardPayments(db, a, { after: p3.prev! });
    expect(back.rows.map((r) => r.id)).toEqual(p2.rows.map((r) => r.id));
    expect(back.from).toBe(26);
    const first = await listDashboardPayments(db, a, { after: back.prev! });
    expect(first.rows.map((r) => r.id)).toEqual(p1.rows.map((r) => r.id));
    expect(first.prev).toBeNull();
  });
});

describe('payment search and date range', () => {
  it('finds by part of the email or name, or a whole pay_ id; the search is text, not a LIKE pattern', async () => {
    expect((await listDashboardPayments(db, a, { q: 'AYESHA@' })).total).toBe(30);
    expect((await listDashboardPayments(db, a, { q: 'bil' })).total).toBe(30);
    const one = (await listDashboardPayments(db, a, {})).rows[3];
    expect((await listDashboardPayments(db, a, { q: one.id })).rows.map((r) => r.id)).toEqual([one.id]);
    expect((await listDashboardPayments(db, a, { q: '%' })).total).toBe(0);
    expect((await listDashboardPayments(db, a, { q: '_' })).total).toBe(0);
    expect((await paymentStatusCounts(db, a, { q: 'ayesha' })).all).toBe(30);
  });

  it('keeps only payments since the range start', async () => {
    const since = new Date(Date.UTC(2026, 10, 11, 10, 10)); // the last 30 of the 60 (10:10 to 10:19)
    expect((await listDashboardPayments(db, a, { since })).total).toBe(30);
    expect((await paymentStatusCounts(db, a, { since })).all).toBe(30);
  });
});
