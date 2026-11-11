import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { customers, disputes } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { createTestDb } from '@/test/db';
import { makeMerchant, makePayment } from '@/test/factories';
import { listCustomers } from './customers';
import { listDisputes } from './disputes';

let db: Db;
let a: string;
let b: string;
const t = (m: number) => new Date(Date.UTC(2026, 10, 11, 10, m));
async function customer(merchantId: string, email: string, name: string) {
  const id = newId('cus');
  await db.insert(customers).values({ id, merchantId, email, name });
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  b = (await makeMerchant(db)).id;
});

describe('listCustomers (PS-DB-004)', () => {
  it('one row per email, net paid after refunds, newest buyer first, per merchant', async () => {
    const ayesha = await customer(a, 'ayesha@example.com', 'Ayesha');
    const bilal = await customer(a, 'bilal@example.com', 'Bilal');
    await makePayment(db, a, { customerId: ayesha, amount: 510000, status: 'succeeded', createdAt: t(1) });
    await makePayment(db, a, { customerId: ayesha, amount: 200000, status: 'partially_refunded', amountRefunded: 50000, createdAt: t(5) });
    await makePayment(db, a, { customerId: ayesha, amount: 999900, status: 'failed', createdAt: t(6) });
    await makePayment(db, a, { customerId: bilal, amount: 100000, status: 'succeeded', createdAt: t(3) });
    const theirs = await customer(b, 'ayesha@example.com', 'Ayesha');
    await makePayment(db, b, { customerId: theirs, amount: 700000, status: 'succeeded' });

    const rows = await listCustomers(db, a);
    expect(rows.map((r) => [r.email, r.payments, r.netPaid])).toEqual([
      ['ayesha@example.com', 3, 510000 + 200000 - 50000],
      ['bilal@example.com', 1, 100000],
    ]);
    expect(rows[0].lastPaymentAt).toEqual(t(6));
    expect((await listCustomers(db, b)).map((r) => r.netPaid)).toEqual([700000]);
  });
});

describe('listDisputes', () => {
  it('open disputes first by respond-by, then closed ones newest first', async () => {
    const add = async (status: 'needs_response' | 'won' | 'lost', respondBy: Date, createdAt: Date) => {
      const p = await makePayment(db, a);
      await db.insert(disputes).values({ id: newId('dp'), merchantId: a, paymentId: p.id, amount: 510000, reason: 'fraudulent', status, previousPaymentStatus: 'succeeded', respondBy, createdAt });
      return status + respondBy.getUTCMinutes();
    };
    await add('won', t(50), t(1));
    await add('needs_response', t(40), t(2));
    await add('lost', t(55), t(3));
    await add('needs_response', t(30), t(4));
    const rows = await listDisputes(db, a);
    expect(rows.map((r) => `${r.status}${r.respondBy.getUTCMinutes()}`)).toEqual(['needs_response30', 'needs_response40', 'lost55', 'won50']);
    expect(rows[0].customerName).toBe('Ayesha Khan');
    expect(await listDisputes(db, b)).toEqual([]);
  });
});
