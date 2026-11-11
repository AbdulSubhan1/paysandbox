import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, paymentActivity } from '@/lib/db/schema';
import { createMerchant } from '@/lib/merchants/merchants';
import { addHours } from '@/lib/time';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { expectMatchesSchema } from '@/test/openapi';
import { GET } from './[id]/route';
import { POST } from './route';

let db: Db;
let a: { id: string; sk: string };
let b: { id: string; sk: string };
const item = { name: 'Developer hoodie', quantity: 1, amount: 510000 };
const valid = {
  amount: 510000,
  currency: 'PKR',
  line_items: [item],
  success_url: 'https://my-store.test/thanks',
  cancel_url: 'https://my-store.test/cart',
};

beforeEach(async () => {
  db = await createTestDb();
  const user = await makeUser(db);
  const ma = await createMerchant(db, user.id, 'Chai Code Co.');
  const mb = await createMerchant(db, user.id, 'Other Shop');
  a = { id: ma.merchant.id, sk: ma.secretKey };
  b = { id: mb.merchant.id, sk: mb.secretKey };
});

const post = (body: unknown, key = a.sk, idempotencyKey?: string) =>
  callRoute(POST, { key, body, idempotencyKey, path: '/api/v1/checkout_sessions' });
const get = (id: string, key = a.sk) => callRoute(GET, { key, params: { id }, path: `/api/v1/checkout_sessions/${id}` });

describe('POST /api/v1/checkout_sessions', () => {
  it('creates an open 24-hour session that matches the OpenAPI schema (PS-CS-008)', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expectMatchesSchema('CheckoutSession', res.json);
    expect(res.json).toMatchObject({
      object: 'checkout_session',
      amount: 510000,
      currency: 'pkr',
      status: 'open',
      livemode: false,
      payment: null,
      url: expect.stringMatching(/\/c\/cs_test_[0-9A-Za-z]{24}$/),
    });
    expect(res.json.expires_at - res.json.created).toBe(24 * 3600);
  });

  it('records "Checkout session created" on the timeline', async () => {
    const res = await post(valid);
    const rows = await db.select().from(paymentActivity).where(eq(paymentActivity.checkoutSessionId, res.json.id));
    expect(rows.map((r) => r.message)).toEqual(['Checkout session created']);
  });

  it.each([
    [{ amount: 99 }, 'amount_too_small', 'amount'],
    [{ amount: 0 }, 'amount_too_small', 'amount'],
    [{ amount: 100000001 }, 'amount_too_large', 'amount'],
    [{ amount: 5100.5 }, 'amount_not_integer', 'amount'],
    [{ amount: '5100' }, 'amount_not_integer', 'amount'],
    [{ currency: 'usd' }, 'currency_mismatch', 'currency'],
    [{ currency: 'inr' }, 'currency_not_supported', 'currency'],
    [{ success_url: 'http://evil.test/x' }, 'parameter_invalid', 'success_url'],
    [{ cancel_url: 'not a url' }, 'parameter_invalid', 'cancel_url'],
    [{ line_items: Array(21).fill(item) }, 'parameter_invalid', 'line_items'],
    [{ line_items: [] }, 'parameter_invalid', 'line_items'],
    [{ line_items: [{ ...item, name: 'x'.repeat(1000) }] }, 'parameter_invalid', 'line_items'],
    [{ customer_email: 'nope' }, 'parameter_invalid', 'customer_email'],
  ])('rejects %j with %s (PS-CS-001…007)', async (change, code, param) => {
    const res = await post({ ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ type: 'invalid_request_error', code, param });
    expectMatchesSchema('Error', res.json);
  });

  it('names a missing field', async () => {
    const { success_url: _omit, ...rest } = valid;
    expect((await post(rest)).json.error).toMatchObject({ code: 'parameter_missing', param: 'success_url' });
  });

  it('accepts the boundaries and localhost URLs (PS-CS-002/003, PS-RD-006)', async () => {
    expect((await post({ ...valid, amount: 100 })).status).toBe(200);
    expect((await post({ ...valid, amount: 100000000 })).status).toBe(200);
    expect((await post({ ...valid, success_url: 'http://localhost:3000/thanks' })).status).toBe(200);
    expect((await post({ ...valid, line_items: Array(20).fill(item) })).status).toBe(200);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await post('amount=510000')).json.error.code).toBe('invalid_json');
  });

  it('replays with the same Idempotency-Key and creates one session (PS-IDEM-001)', async () => {
    const first = await post(valid, a.sk, 'order_1042');
    const second = await post(valid, a.sk, 'order_1042');
    expect(second.json.id).toBe(first.json.id);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await db.select().from(checkoutSessions).where(eq(checkoutSessions.merchantId, a.id))).toHaveLength(1);
  });

  it('refuses the 201st session in a day (PS-AUTH-011)', async () => {
    for (let i = 0; i < 200; i++) expect((await post(valid)).status).toBe(200);
    const over = await post(valid);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe('daily_limit_reached');
  });
});

describe('GET /api/v1/checkout_sessions/{id}', () => {
  it('returns the session to its merchant only (PS-AUTH-005)', async () => {
    const { json: created } = await post(valid);
    const mine = await get(created.id);
    expect(mine.status).toBe(200);
    expectMatchesSchema('CheckoutSession', mine.json);
    const theirs = await get(created.id, b.sk);
    expect(theirs.status).toBe(404);
    expect(theirs.json.error.code).toBe('resource_missing');
  });

  it('reports an old session as expired without changing the stored row', async () => {
    const { json: created } = await post(valid);
    await db.update(checkoutSessions).set({ expiresAt: addHours(new Date(), -1) }).where(eq(checkoutSessions.id, created.id));
    expect((await get(created.id)).json.status).toBe('expired');
    const [row] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, created.id));
    expect(row.status).toBe('open');
  });
});

describe('POST /api/v1/checkout_sessions on a USD project', () => {
  let usd: { id: string; sk: string };
  beforeEach(async () => {
    const user = await makeUser(db);
    const m = await createMerchant(db, user.id, 'Dollar Shop', 'usd');
    usd = { id: m.merchant.id, sk: m.secretKey };
  });
  const usdBody = { amount: 29999, line_items: [{ name: 'Car plan', quantity: 1, amount: 29999 }], success_url: valid.success_url, cancel_url: valid.cancel_url };

  it("uses the project's currency when currency is left out", async () => {
    const res = await post(usdBody, usd.sk);
    expect(res.status).toBe(200);
    expectMatchesSchema('CheckoutSession', res.json);
    expect(res.json).toMatchObject({ amount: 29999, currency: 'usd' });
  });

  it('accepts the same currency in any case', async () => {
    expect((await post({ ...usdBody, currency: 'USD' }, usd.sk)).json.currency).toBe('usd');
  });

  it("refuses another currency than the project's (currency_mismatch)", async () => {
    const res = await post({ ...usdBody, currency: 'pkr' }, usd.sk);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ code: 'currency_mismatch', param: 'currency' });
    expect(res.json.error.message).toContain('USD');
  });

  it('refuses a currency PaySandbox does not offer (currency_not_supported)', async () => {
    const res = await post({ ...usdBody, currency: 'inr' }, usd.sk);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ code: 'currency_not_supported', param: 'currency' });
  });

  it('applies the USD maximum of 5,000.00', async () => {
    expect((await post({ ...usdBody, amount: 500_000, line_items: [{ ...usdBody.line_items[0], amount: 500_000 }] }, usd.sk)).status).toBe(200);
    const res = await post({ ...usdBody, amount: 500_001 }, usd.sk);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ code: 'amount_too_large', param: 'amount' });
    expect(res.json.error.message).toContain('USD 5,000.00');
  });
});
