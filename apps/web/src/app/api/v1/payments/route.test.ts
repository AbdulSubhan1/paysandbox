import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createMerchant } from '@/lib/merchants/merchants';
import { payCheckoutSession } from '@/lib/payments/pay';
import { addHours } from '@/lib/time';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makeSession, makeUser } from '@/test/factories';
import { expectMatchesSchema } from '@/test/openapi';
import { GET as getOne } from './[id]/route';
import { GET as list } from './route';

let db: Db;
let a: { id: string; sk: string };
let b: { sk: string };
let ids: string[];

beforeEach(async () => {
  db = await createTestDb();
  const user = await makeUser(db);
  const ma = await createMerchant(db, user.id, 'Chai Code Co.');
  const mb = await createMerchant(db, user.id, 'Other Shop');
  a = { id: ma.merchant.id, sk: ma.secretKey };
  b = { sk: mb.secretKey };
  ids = [];
  for (let i = 0; i < 3; i++) {
    const s = await makeSession(db, a.id, { expiresAt: addHours(new Date(), 24) });
    const at = new Date(Date.UTC(2026, 10, 11, 10, i)); // 10:00, 10:01, 10:02
    const r = await payCheckoutSession(
      db,
      { sessionId: s.id, attemptId: `a${i}`, email: 'a@x.pk', name: 'A', cardNumber: '4242424242424242', expiry: '12/29' },
      at,
    );
    ids.push(r.paymentId);
  }
});

const get = (query: string, key = a.sk) => callRoute(list, { key, path: `/api/v1/payments${query}` });

describe('GET /api/v1/payments', () => {
  it('lists newest first and pages with starting_after', async () => {
    const page1 = await get('?limit=2');
    expectMatchesSchema('PaymentList', page1.json);
    expect(page1.json.data.map((p: { id: string }) => p.id)).toEqual([ids[2], ids[1]]);
    expect(page1.json.has_more).toBe(true);
    const page2 = await get(`?limit=2&starting_after=${ids[1]}`);
    expect(page2.json.data.map((p: { id: string }) => p.id)).toEqual([ids[0]]);
    expect(page2.json.has_more).toBe(false);
  });

  it('shows another merchant nothing', async () => {
    expect((await get('', b.sk)).json.data).toEqual([]);
  });

  it.each(['?limit=0', '?limit=101', '?limit=abc'])('rejects %s', async (q) => {
    expect((await get(q)).json.error).toMatchObject({ code: 'parameter_invalid', param: 'limit' });
  });
});

describe('GET /api/v1/payments/{id}', () => {
  it('returns the payment to its merchant and 404 to others (PS-AUTH-005)', async () => {
    const mine = await callRoute(getOne, { key: a.sk, params: { id: ids[0] } });
    expect(mine.status).toBe(200);
    expectMatchesSchema('Payment', mine.json);
    expect(mine.json).toMatchObject({ id: ids[0], card: { brand: 'visa', last4: '4242' }, customer: { email: 'a@x.pk' } });
    expect((await callRoute(getOne, { key: b.sk, params: { id: ids[0] } })).status).toBe(404);
  });
});
