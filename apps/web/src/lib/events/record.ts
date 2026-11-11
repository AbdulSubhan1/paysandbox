import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { events, webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { enqueueJob } from '@/lib/jobs/jobs';
import type { EventRow } from './objects';

export type EventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.requires_action'
  | 'refund.created'
  | 'dispute.created'
  | 'dispute.closed';

/**
 * Stores an event with a snapshot of the object. If the merchant has an enabled webhook endpoint, it also queues a
 * delivery and an immediate job, in the caller's transaction, so the event and its delivery commit together.
 */
export async function recordEvent(db: Db, e: { merchantId: string; type: EventType; payload: object; now: Date }): Promise<string> {
  const id = newId('evt');
  await db.insert(events).values({ id, merchantId: e.merchantId, type: e.type, payload: e.payload, createdAt: e.now });
  const [endpoint] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.merchantId, e.merchantId), eq(webhookEndpoints.enabled, true)));
  if (endpoint) {
    const deliveryId = newId('dlv');
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      merchantId: e.merchantId,
      eventId: id,
      endpointId: endpoint.id,
      nextAttemptAt: e.now,
      createdAt: e.now,
      updatedAt: e.now,
    });
    await enqueueJob(db, { merchantId: e.merchantId, kind: 'deliver_webhook', refId: deliveryId, runAt: e.now, now: e.now });
  }
  return id;
}

export async function getEvent(db: Db, merchantId: string, id: string): Promise<EventRow | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.merchantId, merchantId)));
  return row ?? null;
}
