import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { Webhook } from 'standardwebhooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { jobs, usageDaily, webhookAttempts, webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { type JobHandlers, runJob } from '@/lib/jobs/jobs';
import { CAPS } from '@/lib/api/usage';
import { karachiDay, secondsUntilKarachiMidnight } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant } from '@/test/factories';
import { attemptDelivery, type DeliveryDeps, deliverWebhookJob, MAX_RESPONSE_BYTES, SNIPPET_BYTES } from './deliver';
import { rollWebhookSecret, setWebhookEndpoint } from './endpoints';
import type { Resolver } from './ssrf';

type Received = { path: string; headers: Record<string, string>; body: string };
const servers: { close(): void }[] = [];

/** A real receiver on 127.0.0.1. `reply` answers each request; it gets the request number (1-based). */
async function startServer(reply: (n: number, req: IncomingMessage, res: ServerResponse) => void) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers as Record<string, string>, body });
      reply(received.length, req, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push({ close: () => (server.closeAllConnections(), server.close()) });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, received };
}
const status = (codes: number[]) => (n: number, _req: IncomingMessage, res: ServerResponse) =>
  res.writeHead(codes[Math.min(n, codes.length) - 1]).end('ok');

const deps: DeliveryDeps = { allowPrivate: true, timeoutMs: 2000 };
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});
afterEach(() => {
  servers.splice(0).forEach((s) => s.close());
  vi.unstubAllEnvs();
});

async function eventFor(url: string, now = new Date()) {
  const { endpoint, secret } = await makeEndpoint(db, merchantId, { url });
  const eventId = await recordEvent(db, { merchantId, type: 'payment.succeeded', payload: { id: 'pay_1', object: 'payment', amount: 510000 }, now });
  const [dlv] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.eventId, eventId));
  return { endpoint, secret, eventId, deliveryId: dlv.id };
}
const delivery = async (id: string) => (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)))[0];
const attempts = async (id: string) => db.select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, id)).orderBy(webhookAttempts.attempt);

describe('attemptDelivery', () => {
  it('retries a 500 after 1 minute and delivers with the same webhook-id (PS-WH-004)', async () => {
    const srv = await startServer(status([500, 200]));
    const { secret, eventId, deliveryId } = await eventFor(srv.url);
    const t1 = new Date();
    expect(await attemptDelivery(db, deliveryId, t1, deps)).toEqual({ retryAt: minutes(t1, 1) });
    expect(await attemptDelivery(db, deliveryId, minutes(t1, 1), deps)).toEqual({ done: true });
    expect(srv.received).toHaveLength(2);
    for (const r of srv.received) {
      expect(r.headers['webhook-id']).toBe(eventId);
      expect(r.headers['content-type']).toBe('application/json');
      expect(new Webhook(secret).verify(r.body, r.headers)).toMatchObject({ id: eventId, object: 'event', livemode: false });
    }
    expect(await delivery(deliveryId)).toMatchObject({ state: 'delivered', attemptCount: 2, nextAttemptAt: minutes(t1, 1) });
    expect((await attempts(deliveryId)).map((a) => a.statusCode)).toEqual([500, 200]);
  });

  it('counts a timeout as a failed attempt (PS-WH-005)', async () => {
    const srv = await startServer(() => {}); // never answers
    const { deliveryId } = await eventFor(srv.url);
    const t = new Date();
    expect(await attemptDelivery(db, deliveryId, t, { ...deps, timeoutMs: 200 })).toEqual({ retryAt: minutes(t, 1) });
    expect((await attempts(deliveryId))[0]).toMatchObject({ statusCode: null, error: 'timeout' });
  });

  it('does not follow a redirect (PS-WH-006)', async () => {
    const srv = await startServer((_n, _req, res) => res.writeHead(302, { location: '/elsewhere' }).end());
    const { deliveryId } = await eventFor(srv.url);
    await attemptDelivery(db, deliveryId, new Date(), deps);
    expect(srv.received.map((r) => r.path)).toEqual(['/hook']);
    expect((await attempts(deliveryId))[0]).toMatchObject({ statusCode: 302, error: 'redirect' });
  });

  it('makes 6 attempts on the published schedule, then fails the delivery (PS-WH-007)', async () => {
    const srv = await startServer(status([500]));
    const { deliveryId, endpoint } = await eventFor(srv.url);
    let at = new Date('2026-11-11T10:00:00Z');
    const times: number[] = [];
    for (;;) {
      times.push(at.getTime());
      const out = await attemptDelivery(db, deliveryId, at, deps);
      if ('done' in out) break;
      at = out.retryAt;
    }
    expect(times.map((t) => (t - times[0]) / 60_000)).toEqual([0, 1, 6, 36, 156, 516]);
    expect(await delivery(deliveryId)).toMatchObject({ state: 'failed', attemptCount: 6 });
    expect((await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id)))[0].consecutiveFailures).toBe(1);
  });

  it('disables the endpoint at 20 failed deliveries in a row; a success resets the count', async () => {
    const srv = await startServer(status([500]));
    const { deliveryId, endpoint } = await eventFor(srv.url);
    await db.update(webhookEndpoints).set({ consecutiveFailures: 19 }).where(eq(webhookEndpoints.id, endpoint.id));
    await db.update(webhookDeliveries).set({ attemptCount: 5 }).where(eq(webhookDeliveries.id, deliveryId));
    expect(await attemptDelivery(db, deliveryId, new Date(), deps)).toEqual({ done: true });
    const [row] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id));
    expect(row).toMatchObject({ enabled: false, disabledReason: 'too_many_failures', consecutiveFailures: 20 });

    const ok = await startServer(status([200]));
    await db.update(webhookEndpoints).set({ url: ok.url, enabled: true, consecutiveFailures: 7 }).where(eq(webhookEndpoints.id, endpoint.id));
    const eventId = await recordEvent(db, { merchantId, type: 'payment.failed', payload: {}, now: new Date() });
    const [d2] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.eventId, eventId));
    await attemptDelivery(db, d2.id, new Date(), deps);
    expect((await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id)))[0].consecutiveFailures).toBe(0);
  });

  it('reads at most 64 KB of a huge response (PS-WH-014)', async () => {
    const srv = await startServer((_n, _req, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(1024 * 1024, 'a');
      for (let i = 0; i < 10; i++) res.write(chunk);
      res.end();
    });
    const { deliveryId } = await eventFor(srv.url);
    const started = Date.now();
    expect(await attemptDelivery(db, deliveryId, new Date(), deps)).toEqual({ done: true });
    expect(Date.now() - started).toBeLessThan(2000);
    const [a] = await attempts(deliveryId);
    expect(a.responseSnippet!.length).toBeLessThanOrEqual(SNIPPET_BYTES);
    expect(MAX_RESPONSE_BYTES).toBe(65_536);
  });

  it('blocks a host that resolves to a private address at connect time (Review Focus 1)', async () => {
    const srv = await startServer(status([200]));
    const port = new URL(srv.url).port;
    const rebind: Resolver = async () => ['127.0.0.1'];
    const { deliveryId } = await eventFor(`https://rebind.example.com:${port}/hook`);
    const out = await attemptDelivery(db, deliveryId, new Date(), { allowPrivate: false, timeoutMs: 2000, resolve: rebind });
    expect('retryAt' in out).toBe(true);
    expect(srv.received).toHaveLength(0);
    expect((await attempts(deliveryId))[0]).toMatchObject({ statusCode: null, error: 'blocked_address' });
  });

  it('blocks a private IP literal in the URL, which skips DNS', async () => {
    const srv = await startServer(status([200]));
    const { deliveryId } = await eventFor(srv.url); // http://127.0.0.1:<port>/hook
    await attemptDelivery(db, deliveryId, new Date(), { allowPrivate: false, timeoutMs: 2000 });
    expect(srv.received).toHaveLength(0);
    expect((await attempts(deliveryId))[0]).toMatchObject({ statusCode: null, error: 'blocked_address' });
  });

  it('sends a retry to the current URL with both signatures after a roll (Review Focus 4)', async () => {
    const first = await startServer(status([500]));
    const second = await startServer(status([200]));
    const { secret: oldSecret, deliveryId } = await eventFor(first.url);
    const t = new Date();
    await attemptDelivery(db, deliveryId, t, deps);
    await setWebhookEndpoint(db, merchantId, second.url, t, { resolve: async () => [], allowPrivate: true });
    const newSecret = await rollWebhookSecret(db, merchantId, t);
    expect(await attemptDelivery(db, deliveryId, minutes(t, 1), deps)).toEqual({ done: true });
    const [r] = second.received;
    expect(r.headers['webhook-signature'].split(' ')).toHaveLength(2);
    expect(new Webhook(oldSecret).verify(r.body, r.headers)).toBeTruthy();
    expect(new Webhook(newSecret).verify(r.body, r.headers)).toBeTruthy();
    expect(r.headers['webhook-id']).toBe(first.received[0].headers['webhook-id']);
  });

  it('waits until Karachi midnight when the daily attempt cap is used up', async () => {
    const srv = await startServer(status([200]));
    const { deliveryId } = await eventFor(srv.url);
    const t = new Date();
    await db.insert(usageDaily).values({ merchantId, day: karachiDay(t), webhookAttempts: CAPS.webhook_attempts });
    const out = await attemptDelivery(db, deliveryId, t, deps);
    expect(out).toEqual({ retryAt: new Date(t.getTime() + secondsUntilKarachiMidnight(t) * 1000) });
    expect(srv.received).toHaveLength(0);
    expect(await attempts(deliveryId)).toHaveLength(0);
  });

  it('fails a delivery whose endpoint was disabled, without sending', async () => {
    const srv = await startServer(status([200]));
    const { deliveryId, endpoint } = await eventFor(srv.url);
    await db.update(webhookEndpoints).set({ enabled: false }).where(eq(webhookEndpoints.id, endpoint.id));
    expect(await attemptDelivery(db, deliveryId, new Date(), deps)).toEqual({ done: true });
    expect(await delivery(deliveryId)).toMatchObject({ state: 'failed', lastError: 'endpoint_disabled' });
    expect(srv.received).toHaveLength(0);
  });

  it('sends one request when two runners take the same job (Review Focus 2)', async () => {
    vi.stubEnv('E2E_AUTH_BYPASS', '1'); // the job uses default deps; E2E mode lets it reach 127.0.0.1
    vi.stubEnv('VERCEL', '');
    const srv = await startServer(status([200]));
    const { deliveryId } = await eventFor(srv.url);
    const [job] = await db.select().from(jobs).where(eq(jobs.refId, deliveryId));
    const handlers = { deliver_webhook: deliverWebhookJob } as unknown as JobHandlers;
    const t = new Date();
    await Promise.all([runJob(db, job.id, t, handlers), runJob(db, job.id, t, handlers)]);
    expect(srv.received).toHaveLength(1);
  });
});
