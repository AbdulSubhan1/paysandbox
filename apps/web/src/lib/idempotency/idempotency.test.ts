import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiResponse } from '@/lib/api/handler';
import type { Db } from '@/lib/db/client';
import { idempotencyKeys } from '@/lib/db/schema';
import { addHours } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeMerchant } from '@/test/factories';
import { withIdempotency } from './idempotency';

let db: Db;
let merchantId: string;
let otherId: string;
let calls: number;
const now = new Date('2026-11-11T10:00:00Z');
const run = async (): Promise<ApiResponse> => ({ status: 200, body: { id: `cs_${++calls}` } });
const args = (key: string | null, body: unknown, over: Partial<{ merchantId: string; now: Date }> = {}) => ({
  merchantId,
  key,
  method: 'POST',
  path: '/api/v1/checkout_sessions',
  body,
  now,
  ...over,
});

beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
  otherId = (await makeMerchant(db)).id;
  calls = 0;
});

describe('withIdempotency', () => {
  it('replays the first response for the same key and body (PS-IDEM-001)', async () => {
    const a = await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
    const b = await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
    expect(b.body).toEqual(a.body);
    expect(b.status).toBe(200);
    expect(b.headers?.['Idempotent-Replayed']).toBe('true');
    expect(calls).toBe(1);
  });

  it('treats the same JSON with keys in another order as the same request', async () => {
    await withIdempotency(db, args('k', { a: 1, b: 2 }), run);
    await withIdempotency(db, args('k', { b: 2, a: 1 }), run);
    expect(calls).toBe(1);
  });

  it('refuses the same key with a different body (PS-IDEM-002)', async () => {
    await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
    await expect(withIdempotency(db, args('order_1042', { amount: 1 }), run)).rejects.toMatchObject({
      status: 422,
      code: 'idempotency_key_reused',
    });
  });

  it('refuses while the first request is still running (PS-IDEM-003)', async () => {
    await db.insert(idempotencyKeys).values({ merchantId, key: 'busy', requestHash: 'x', status: 'in_progress', createdAt: now });
    await expect(withIdempotency(db, args('busy', {}), run)).rejects.toMatchObject({ status: 409, code: 'idempotency_key_in_use' });
  });

  it('keeps keys per merchant (PS-IDEM-005)', async () => {
    await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
    const other = await withIdempotency(db, args('order_1042', { amount: 510000 }, { merchantId: otherId }), run);
    expect(other.body).toEqual({ id: 'cs_2' });
  });

  it('forgets keys after 24 hours (PS-IDEM-004)', async () => {
    await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
    const later = await withIdempotency(db, args('order_1042', { amount: 510000 }, { now: addHours(now, 25) }), run);
    expect(later.body).toEqual({ id: 'cs_2' });
    expect(later.headers?.['Idempotent-Replayed']).toBeUndefined();
  });

  it('does not store server errors, so a retry runs again (PS-IDEM-006)', async () => {
    const boom = async (): Promise<ApiResponse> => {
      throw new Error('db down');
    };
    await expect(withIdempotency(db, args('retry_me', {}), boom)).rejects.toThrow('db down');
    expect((await withIdempotency(db, args('retry_me', {}), run)).body).toEqual({ id: 'cs_1' });
  });

  it('does not store a 429, so the same key works once the limit resets', async () => {
    const limited = async (): Promise<ApiResponse> => ({ status: 429, body: { error: { code: 'daily_limit_reached' } } });
    await withIdempotency(db, args('tomorrow', {}), limited);
    expect((await withIdempotency(db, args('tomorrow', {}), run)).status).toBe(200);
  });

  it('stores and replays 4xx responses (PS-IDEM-006)', async () => {
    const bad = async (): Promise<ApiResponse> => ({ status: 400, body: { error: { code: 'amount_too_small' } } });
    await withIdempotency(db, args('bad', { amount: 1 }), bad);
    const replay = await withIdempotency(db, args('bad', { amount: 1 }), run);
    expect(replay.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('runs straight through without a key', async () => {
    await withIdempotency(db, args(null, {}), run);
    await withIdempotency(db, args(null, {}), run);
    expect(calls).toBe(2);
  });

  it('refuses keys longer than 255 characters (PS-IDEM-007)', async () => {
    await expect(withIdempotency(db, args('x'.repeat(256), {}), run)).rejects.toMatchObject({ status: 400 });
  });
});
