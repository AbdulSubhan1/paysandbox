import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';
import { createMerchant } from '@/lib/merchants/merchants';
import { payCheckoutSession } from '@/lib/payments/pay';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makeSession, makeUser } from '@/test/factories';
import { expectMatchesSchema } from '@/test/openapi';
import { GET } from './route';

let db: Db;
let a: { sk: string };
let b: { sk: string };
let eventId: string;

beforeEach(async () => {
  db = await createTestDb();
  const user = await makeUser(db);
  const ma = await createMerchant(db, user.id, 'Chai Code Co.');
  b = { sk: (await createMerchant(db, user.id, 'Other Shop')).secretKey };
  a = { sk: ma.secretKey };
  const s = await makeSession(db, ma.merchant.id);
  await payCheckoutSession(db, { sessionId: s.id, attemptId: 'a1', email: 'a@x.pk', name: 'A', cardNumber: '4242424242424242', expiry: '12/29' }, new Date());
  [{ id: eventId }] = await db.select({ id: events.id }).from(events).where(eq(events.type, 'payment.succeeded'));
});

const get = (id: string, key: string) => callRoute(GET, { key, path: `/api/v1/events/${id}`, params: { id } });

describe('GET /api/v1/events/{id}', () => {
  it('returns the event envelope with a payment snapshot (PS-WH-011)', async () => {
    const res = await get(eventId, a.sk);
    expect(res.status).toBe(200);
    expectMatchesSchema('Event', res.json);
    expect(res.json).toMatchObject({ id: eventId, object: 'event', type: 'payment.succeeded', livemode: false });
    expect(res.json.data.object).toMatchObject({ object: 'payment', amount: 510000, status: 'succeeded', livemode: false });
    expect(Number.isInteger(res.json.data.object.amount)).toBe(true);
  });

  it("returns 404 for another merchant's event", async () => {
    const res = await get(eventId, b.sk);
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('resource_missing');
  });
});
