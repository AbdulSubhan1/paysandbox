import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { refunds } from '@/lib/db/schema';
import { createMerchant } from '@/lib/merchants/merchants';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makePayment, makeUser } from '@/test/factories';
import { expectMatchesSchema } from '@/test/openapi';
import { POST } from './route';

let db: Db;
let sk: string;
let paymentId: string;
beforeEach(async () => {
  db = await createTestDb();
  const m = await createMerchant(db, (await makeUser(db)).id, 'Chai Code Co.');
  sk = m.secretKey;
  paymentId = (await makePayment(db, m.merchant.id)).id;
});

const post = (body: unknown, idempotencyKey?: string) => callRoute(POST, { key: sk, body, idempotencyKey, path: '/api/v1/refunds' });

describe('POST /api/v1/refunds', () => {
  it('returns the refund object (PS-RF-001)', async () => {
    const res = await post({ payment: paymentId, reason: 'requested_by_customer' });
    expect(res.status).toBe(200);
    expectMatchesSchema('Refund', res.json);
    expect(res.json).toMatchObject({ object: 'refund', amount: 510000, payment: paymentId, currency: 'pkr', livemode: false });
  });

  it('makes one refund for the same Idempotency-Key sent twice (PS-IDEM-008)', async () => {
    const body = { payment: paymentId, amount: 100000, reason: 'duplicate' };
    const first = await post(body, 'refund-1');
    const second = await post(body, 'refund-1');
    expect(second.json).toEqual(first.json);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await db.select().from(refunds)).toHaveLength(1);
  });

  it('returns Stripe-shaped errors', async () => {
    const res = await post({ payment: paymentId, amount: 510001, reason: 'duplicate' });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ type: 'invalid_request_error', code: 'amount_too_large', param: 'amount' });
    expect((await post('nope')).json.error.code).toBe('invalid_json');
  });
});
