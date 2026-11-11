import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { jobs, webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import { attemptDelivery } from './deliver';
import { resendEvent } from './resend';

let db: Db;
let m: string;
const ids: string[] = [];
let url = '';
let close = () => {};

beforeEach(async () => {
  db = await createTestDb();
  m = (await makeMerchant(db)).id;
  ids.length = 0;
  const server = createServer((req, res) => {
    ids.push(String(req.headers['webhook-id']));
    req.resume();
    req.on('end', () => res.writeHead(200).end('ok'));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  close = () => (server.closeAllConnections(), server.close());
});
afterEach(() => close());

const deps = { allowPrivate: true, timeoutMs: 2000 };
const delivery = async (eventId: string) => (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.eventId, eventId)))[0];

describe('resendEvent (PS-WH-009)', () => {
  it('sends a delivered event again: one more attempt, same webhook-id', async () => {
    await makeEndpoint(db, m, { url });
    const now = new Date();
    const eventId = await recordEvent(db, { merchantId: m, type: 'payment.succeeded', payload: { id: 'pay_1' }, now });
    await attemptDelivery(db, (await delivery(eventId)).id, now, deps);
    expect((await delivery(eventId)).state).toBe('delivered');
    await db.update(jobs).set({ state: 'done' }); // the first attempt ran outside its job here; a real run marks it done

    expect(await resendEvent(db, m, eventId, now)).toEqual({ ok: true });
    const d = await delivery(eventId);
    expect(d).toMatchObject({ state: 'pending', nextAttemptAt: now });
    expect((await db.select().from(jobs).where(eq(jobs.refId, d.id))).filter((j) => j.state === 'pending')).toHaveLength(1);
    await attemptDelivery(db, d.id, now, deps);
    expect(ids).toEqual([eventId, eventId]);
    expect(await delivery(eventId)).toMatchObject({ state: 'delivered', attemptCount: 2 });
  });

  it('refuses while a retry is already scheduled, with no endpoint, or with it disabled', async () => {
    const { endpoint } = await makeEndpoint(db, m, { url });
    const now = new Date();
    const eventId = await recordEvent(db, { merchantId: m, type: 'payment.succeeded', payload: {}, now });
    await db.update(webhookDeliveries).set({ nextAttemptAt: new Date(now.getTime() + 60_000) }).where(eq(webhookDeliveries.eventId, eventId));
    expect(await resendEvent(db, m, eventId, now)).toEqual({ ok: false, reason: 'in_progress' });
    await db.update(webhookDeliveries).set({ state: 'failed' }).where(eq(webhookDeliveries.eventId, eventId));
    await db.update(webhookEndpoints).set({ enabled: false }).where(eq(webhookEndpoints.id, endpoint.id));
    expect(await resendEvent(db, m, eventId, now)).toEqual({ ok: false, reason: 'endpoint_disabled' });
    const other = (await makeMerchant(db)).id;
    expect(await resendEvent(db, other, eventId, now)).toEqual({ ok: false, reason: 'no_delivery' });
  });
});
