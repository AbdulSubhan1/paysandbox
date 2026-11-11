import type { events } from '@/lib/db/schema';

export type EventRow = typeof events.$inferSelect;

/** The event envelope, the same in GET /v1/events/{id} and in webhook bodies (openapi.yaml#/components/schemas/Event). */
export function toEventObject(row: EventRow) {
  return {
    id: row.id,
    object: 'event' as const,
    type: row.type,
    created: Math.floor(row.createdAt.getTime() / 1000),
    livemode: false as const,
    data: { object: row.payload },
  };
}
