import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { apiRequestLog } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { createTestDb } from '@/test/db';
import { makeMerchant } from '@/test/factories';
import { listApiRequests, REQUEST_LOG_PAGE_SIZE } from './request-log';

let db: Db;
let a: string;
let b: string;

async function log(merchantId: string, status: number, minute: number) {
  await db.insert(apiRequestLog).values({
    id: newId('req'),
    merchantId,
    method: 'POST',
    path: '/api/v1/checkout_sessions',
    status,
    idempotencyKey: status === 200 ? `order_${minute}` : null,
    errorCode: status >= 400 ? 'parameter_missing' : null,
    durationMs: 40,
    createdAt: new Date(Date.UTC(2026, 10, 11, 10, minute)),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  a = (await makeMerchant(db)).id;
  b = (await makeMerchant(db)).id;
  for (let i = 0; i < 60; i++) await log(a, i % 3 === 0 ? 400 : 200, i);
  await log(b, 500, 0);
});

describe('listApiRequests (PS-DEV-004)', () => {
  it('pages newest first, only this merchant', async () => {
    const first = await listApiRequests(db, a, {});
    expect(first.rows).toHaveLength(REQUEST_LOG_PAGE_SIZE);
    expect(first.rows[0].createdAt.getTime()).toBeGreaterThan(first.rows[1].createdAt.getTime());
    const second = await listApiRequests(db, a, { before: first.next! });
    expect(second.rows).toHaveLength(10);
    expect(second.next).toBeNull();
    expect([...first.rows, ...second.rows].every((r) => r.status !== 500)).toBe(true);
  });

  it('can show failures only', async () => {
    const r = await listApiRequests(db, a, { failedOnly: true });
    expect(r.rows).toHaveLength(20);
    expect(r.rows.every((x) => x.status >= 400 && x.errorCode === 'parameter_missing')).toBe(true);
  });
});
