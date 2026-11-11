import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { apiRequestLog } from '@/lib/db/schema';
import { createMerchant } from '@/lib/merchants/merchants';
import { createTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { ApiError } from './errors';
import { withApi } from './handler';

let db: Db;
let keys: { merchantId: string; pk: string; sk: string };

beforeEach(async () => {
  db = await createTestDb();
  const user = await makeUser(db);
  const { merchant, publishableKey, secretKey } = await createMerchant(db, user.id, 'Chai Code Co.');
  keys = { merchantId: merchant.id, pk: publishableKey, sk: secretKey };
});

const whoAmI = withApi(async (ctx) => ({ status: 200, body: { merchant: ctx.merchantId } }));
const failing = withApi(async () => {
  throw new ApiError(400, 'invalid_request_error', 'parameter_missing', 'Missing amount.', 'amount');
});
const crashing = withApi(async () => {
  throw new Error('boom');
});

async function call(handler: typeof whoAmI, authorization: string | null) {
  const headers = new Headers();
  if (authorization) headers.set('authorization', authorization);
  const res = await handler(new Request('http://localhost/api/v1/test', { headers }), { params: Promise.resolve({}) });
  return { status: res.status, headers: res.headers, json: await res.json() };
}
const basic = (key: string) => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

describe('withApi authentication (PS-AUTH-001…004)', () => {
  it('accepts a secret key as Bearer or Basic', async () => {
    expect((await call(whoAmI, `Bearer ${keys.sk}`)).json).toEqual({ merchant: keys.merchantId });
    expect((await call(whoAmI, basic(keys.sk))).status).toBe(200);
  });

  it('explains each kind of wrong key', async () => {
    const none = await call(whoAmI, null);
    expect(none.status).toBe(401);
    expect(none.json.error).toMatchObject({ type: 'authentication_error', code: 'invalid_api_key', message: 'No API key provided.' });
    expect((await call(whoAmI, `Bearer ${keys.pk}`)).json.error.message).toMatch(/publishable key can't be used here/);
    expect((await call(whoAmI, 'Bearer sk_live_abc')).json.error.message).toMatch(/no live mode/);
    expect((await call(whoAmI, 'Bearer sk_test_unknown')).json.error.message).toBe('Invalid API key.');
  });
});

describe('withApi errors and logging', () => {
  it('returns ApiError as the error shape and logs it without bodies', async () => {
    const res = await call(failing, `Bearer ${keys.sk}`);
    expect(res.status).toBe(400);
    expect(res.json).toEqual({
      error: { type: 'invalid_request_error', code: 'parameter_missing', message: 'Missing amount.', param: 'amount' },
    });
    const [row] = await db.select().from(apiRequestLog).where(eq(apiRequestLog.merchantId, keys.merchantId));
    expect(row).toMatchObject({ method: 'GET', path: '/api/v1/test', status: 400, errorCode: 'parameter_missing' });
  });

  it('turns unexpected errors into a 500 api_error', async () => {
    const res = await call(crashing, `Bearer ${keys.sk}`);
    expect(res.status).toBe(500);
    expect(res.json.error.type).toBe('api_error');
  });
});

describe('withApi daily cap (PS-AUTH-010)', () => {
  it('refuses the 1,001st request with Retry-After and does not log refused requests', async () => {
    for (let i = 0; i < 1000; i++) await call(whoAmI, `Bearer ${keys.sk}`);
    const over = await call(whoAmI, `Bearer ${keys.sk}`);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe('daily_limit_reached');
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    const [{ n }] = await db.select({ n: count() }).from(apiRequestLog).where(eq(apiRequestLog.merchantId, keys.merchantId));
    expect(n).toBe(1000);
  });
});

describe('withApi idempotency', () => {
  it('replays a POST with the same Idempotency-Key and runs the handler once', async () => {
    let runs = 0;
    const create = withApi(
      async (_ctx, req) => ({ status: 200, body: { run: ++runs, got: await req.json() } }),
      { idempotent: true },
    );
    const post = () =>
      create(
        new Request('http://localhost/api/v1/things', {
          method: 'POST',
          headers: { authorization: `Bearer ${keys.sk}`, 'idempotency-key': 'order_1042', 'content-type': 'application/json' },
          body: JSON.stringify({ amount: 510000 }),
        }),
        { params: Promise.resolve({}) },
      );
    const first = await post();
    const second = await post();
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(runs).toBe(1);
  });
});

describe('withApi timing', () => {
  it('reports server time in a Server-Timing header, on success and on errors', async () => {
    for (const [h, auth] of [[whoAmI, `Bearer ${keys.sk}`], [failing, `Bearer ${keys.sk}`], [whoAmI, null]] as const) {
      const res = await call(h, auth);
      expect(res.headers.get('server-timing')).toMatch(/^app;dur=\d+$/);
    }
  });
});
