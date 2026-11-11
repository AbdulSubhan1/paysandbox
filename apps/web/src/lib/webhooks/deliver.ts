import { isIP } from 'node:net';
import type { ReadableStream } from 'node:stream/web';
import { eq, sql } from 'drizzle-orm';
import { Agent, fetch } from 'undici';
import { consumeUsage } from '@/lib/api/usage';
import { isE2eMode } from '@/lib/auth/allowlist';
import type { Db } from '@/lib/db/client';
import { events, webhookAttempts, webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { toEventObject } from '@/lib/events/objects';
import { newId } from '@/lib/ids';
import type { JobHandler, JobOutcome } from '@/lib/jobs/jobs';
import { activeSecrets, ENDPOINT_DISABLE_AFTER } from './endpoints';
import { signWebhook } from './signing';
import { checkedLookup, defaultResolver, isPublicAddress, type Resolver } from './ssrf';

/** Minutes to wait after attempt 1, 2, 3, 4 and 5 fail (design §8). */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 360] as const;
export const MAX_ATTEMPTS = 6;
export const DELIVERY_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 65_536;
export const SNIPPET_BYTES = 1024;

export type DeliveryDeps = { allowPrivate: boolean; timeoutMs: number; resolve?: Resolver };

export function defaultDeliveryDeps(): DeliveryDeps {
  return { allowPrivate: isE2eMode(), timeoutMs: DELIVERY_TIMEOUT_MS };
}

type SendResult = { statusCode: number | null; error: 'timeout' | 'network' | 'blocked_address' | 'redirect' | null; snippet: string | null };

async function readCapped(body: ReadableStream | null): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (size < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.length;
    }
  } catch {
    // a body that breaks off mid-read still has its status code
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES);
}

async function send(url: string, headers: Record<string, string>, body: string, deps: DeliveryDeps): Promise<SendResult> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  // IP literals skip DNS, so the connect-time lookup never sees them: check them here.
  if (!deps.allowPrivate && isIP(host) && !isPublicAddress(host)) return { statusCode: null, error: 'blocked_address', snippet: null };
  const dispatcher = new Agent({ connect: { lookup: checkedLookup(deps.allowPrivate, deps.resolve ?? defaultResolver) } });
  try {
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(deps.timeoutMs), dispatcher });
    const snippet = (await readCapped(res.body)).subarray(0, SNIPPET_BYTES).toString('utf8');
    return { statusCode: res.status, error: res.status >= 300 && res.status < 400 ? 'redirect' : null, snippet };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return { statusCode: null, error: 'timeout', snippet: null };
    if (err.cause?.code === 'EBLOCKED') return { statusCode: null, error: 'blocked_address', snippet: null };
    return { statusCode: null, error: 'network', snippet: null };
  } finally {
    dispatcher.destroy().catch(() => {});
  }
}

/** One attempt of one delivery: sign, POST, record, then schedule the next attempt or settle the delivery. */
export async function attemptDelivery(db: Db, deliveryId: string, now: Date, deps: DeliveryDeps): Promise<JobOutcome> {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
  if (!delivery || delivery.state !== 'pending') return { done: true };
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId));
  if (!endpoint?.enabled) {
    await db
      .update(webhookDeliveries)
      .set({ state: 'failed', lastError: 'endpoint_disabled', nextAttemptAt: null, updatedAt: now })
      .where(eq(webhookDeliveries.id, deliveryId));
    return { done: true };
  }
  const usage = await consumeUsage(db, delivery.merchantId, 'webhook_attempts', now);
  if (!usage.allowed) return { retryAt: new Date(now.getTime() + usage.retryAfterSeconds * 1000) };

  const [event] = await db.select().from(events).where(eq(events.id, delivery.eventId));
  const body = JSON.stringify(toEventObject(event));
  const headers = {
    ...signWebhook(activeSecrets(endpoint, now), event.id, now, body),
    'content-type': 'application/json',
    'user-agent': 'PaySandbox-Webhooks/1.0',
  };
  const attempt = delivery.attemptCount + 1;
  const started = Date.now();
  const result = await send(endpoint.url, headers, body, deps);
  await db.insert(webhookAttempts).values({
    id: newId('att'),
    deliveryId,
    attempt,
    url: endpoint.url,
    statusCode: result.statusCode,
    error: result.error,
    durationMs: Date.now() - started,
    responseSnippet: result.snippet,
    requestHeaders: headers,
    attemptedAt: now,
  });

  const ok = result.error === null && result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
  if (ok) {
    await db
      .update(webhookDeliveries)
      .set({ state: 'delivered', attemptCount: attempt, lastError: null, updatedAt: now })
      .where(eq(webhookDeliveries.id, deliveryId));
    await db.update(webhookEndpoints).set({ consecutiveFailures: 0 }).where(eq(webhookEndpoints.id, endpoint.id));
    return { done: true };
  }

  const lastError = result.error ?? `http_${result.statusCode}`;
  if (attempt < MAX_ATTEMPTS) {
    const retryAt = new Date(now.getTime() + RETRY_DELAYS_MINUTES[attempt - 1] * 60_000);
    await db
      .update(webhookDeliveries)
      .set({ attemptCount: attempt, nextAttemptAt: retryAt, lastError, updatedAt: now })
      .where(eq(webhookDeliveries.id, deliveryId));
    return { retryAt };
  }
  await db
    .update(webhookDeliveries)
    .set({ state: 'failed', attemptCount: attempt, nextAttemptAt: null, lastError, updatedAt: now })
    .where(eq(webhookDeliveries.id, deliveryId));
  const [counted] = await db
    .update(webhookEndpoints)
    .set({ consecutiveFailures: sql`${webhookEndpoints.consecutiveFailures} + 1` })
    .where(eq(webhookEndpoints.id, endpoint.id))
    .returning();
  if (counted.consecutiveFailures >= ENDPOINT_DISABLE_AFTER)
    await db.update(webhookEndpoints).set({ enabled: false, disabledReason: 'too_many_failures' }).where(eq(webhookEndpoints.id, endpoint.id));
  return { done: true };
}

export const deliverWebhookJob: JobHandler = (db, job, now) => attemptDelivery(db, job.refId, now, defaultDeliveryDeps());
