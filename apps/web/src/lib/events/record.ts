import type { Db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';
import { newId } from '@/lib/ids';

export type EventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.requires_action'
  | 'refund.created'
  | 'dispute.created'
  | 'dispute.closed';

/** Stores an event with a snapshot of the object. Delivery to webhooks comes in Plan 2. */
export async function recordEvent(db: Db, e: { merchantId: string; type: EventType; payload: object; now: Date }): Promise<string> {
  const id = newId('evt');
  await db.insert(events).values({ id, merchantId: e.merchantId, type: e.type, payload: e.payload, createdAt: e.now });
  return id;
}
