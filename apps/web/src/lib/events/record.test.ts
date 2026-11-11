import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { jobs, webhookDeliveries } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import { toEventObject } from './objects';
import { getEvent, recordEvent } from './record';

const now = new Date('2026-11-11T10:00:00Z');
let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

const record = () => recordEvent(db, { merchantId, type: 'payment.succeeded', payload: { id: 'pay_1', amount: 510000 }, now });

describe('recordEvent', () => {
  it('queues no delivery when the merchant has no endpoint', async () => {
    await record();
    expect(await db.select().from(webhookDeliveries)).toHaveLength(0);
    expect(await db.select().from(jobs)).toHaveLength(0);
  });

  it('queues one delivery and an immediate job for an enabled endpoint', async () => {
    const { endpoint } = await makeEndpoint(db, merchantId);
    const eventId = await record();
    const [dlv] = await db.select().from(webhookDeliveries);
    expect(dlv).toMatchObject({ eventId, endpointId: endpoint.id, state: 'pending', attemptCount: 0, nextAttemptAt: now });
    const [job] = await db.select().from(jobs);
    expect(job).toMatchObject({ kind: 'deliver_webhook', refId: dlv.id, runAt: now, merchantId });
  });

  it('queues nothing for a disabled endpoint', async () => {
    await makeEndpoint(db, merchantId, { enabled: false });
    await record();
    expect(await db.select().from(webhookDeliveries)).toHaveLength(0);
  });

  it('wraps the snapshot in the event envelope (PS-WH-011)', async () => {
    const id = await record();
    const row = (await getEvent(db, merchantId, id))!;
    expect(toEventObject(row)).toEqual({
      id,
      object: 'event',
      type: 'payment.succeeded',
      created: Math.floor(now.getTime() / 1000),
      livemode: false,
      data: { object: { id: 'pay_1', amount: 510000 } },
    });
    expect(await getEvent(db, (await makeMerchant(db)).id, id)).toBeNull();
  });
});
