import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { events, webhookAttempts, webhookDeliveries } from '@/lib/db/schema';
import { type EventRow, toEventObject } from '@/lib/events/objects';
import { decodeCursor, olderThan, pageOf } from './cursor';
import { type EventListRow, eventRowColumns, toEventListRow } from './overview';

export type { EventListRow } from './overview';
export type DeliveryRow = typeof webhookDeliveries.$inferSelect;
export type AttemptRow = typeof webhookAttempts.$inferSelect;

export const EVENTS_PAGE_SIZE = 25;

export async function listEvents(db: Db, merchantId: string, opts: { before?: string }): Promise<{ rows: EventListRow[]; next: string | null }> {
  const cursor = decodeCursor(opts.before);
  const rows = await db
    .select(eventRowColumns)
    .from(events)
    .leftJoin(webhookDeliveries, eq(webhookDeliveries.eventId, events.id))
    .where(and(eq(events.merchantId, merchantId), cursor ? olderThan(events.createdAt, events.id, cursor) : undefined))
    .orderBy(sql`date_trunc('milliseconds', ${events.createdAt}) desc`, desc(events.id))
    .limit(EVENTS_PAGE_SIZE + 1);
  const page = pageOf(rows, EVENTS_PAGE_SIZE);
  return { rows: page.rows.map(toEventListRow), next: page.next };
}

/** The event, the exact JSON body we send for it, its delivery and every attempt. */
export async function getEventDetail(
  db: Db,
  merchantId: string,
  eventId: string,
): Promise<{ event: EventRow; body: string; delivery: DeliveryRow | null; attempts: AttemptRow[] } | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.merchantId, merchantId)));
  if (!event) return null;
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.eventId, event.id));
  const attempts = delivery
    ? await db.select().from(webhookAttempts).where(eq(webhookAttempts.deliveryId, delivery.id)).orderBy(asc(webhookAttempts.attempt))
    : [];
  return { event, body: JSON.stringify(toEventObject(event)), delivery: delivery ?? null, attempts };
}
