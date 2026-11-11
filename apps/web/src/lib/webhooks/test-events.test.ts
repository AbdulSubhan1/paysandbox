import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { events, usageDaily, webhookDeliveries } from '@/lib/db/schema';
import { karachiDay } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import { expectMatchesSchema } from '@/test/openapi';
import { sendTestEvent } from './test-events';

const now = new Date('2026-11-11T10:00:00Z');
let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

describe('sendTestEvent (PS-WH-010)', () => {
  it('needs an endpoint', async () => {
    expect(await sendTestEvent(db, merchantId, 'payment.succeeded', now)).toEqual({ ok: false, reason: 'no_endpoint' });
    expect(await db.select().from(events)).toHaveLength(0);
  });

  it.each([
    ['payment.succeeded', 'Payment'],
    ['payment.failed', 'Payment'],
    ['payment.requires_action', 'Payment'],
    ['refund.created', 'Refund'],
    ['dispute.created', null],
    ['dispute.closed', null],
  ] as const)('records a real %s event with a sample object, queued for delivery', async (type, schema) => {
    await makeEndpoint(db, merchantId);
    const r = await sendTestEvent(db, merchantId, type, now);
    expect(r.ok).toBe(true);
    const [evt] = await db.select().from(events);
    expect(evt.type).toBe(type);
    if (schema) expectMatchesSchema(schema, evt.payload);
    expect(evt.payload).toMatchObject({ livemode: false });
    expect(await db.select().from(webhookDeliveries)).toHaveLength(1);
  });

  it('allows 50 a day', async () => {
    await makeEndpoint(db, merchantId);
    await db.insert(usageDaily).values({ merchantId, day: karachiDay(now), testEvents: 50 });
    expect(await sendTestEvent(db, merchantId, 'payment.succeeded', now)).toEqual({ ok: false, reason: 'daily_limit' });
    expect(await db.select().from(events)).toHaveLength(0);
  });
});
