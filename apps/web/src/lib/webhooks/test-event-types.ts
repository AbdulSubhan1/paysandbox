import type { EventType } from '@/lib/events/record';

/** Event types a merchant can send as a test (no server code here: the dashboard card imports it). */
export const TEST_EVENT_TYPES: EventType[] = [
  'payment.succeeded',
  'payment.failed',
  'payment.requires_action',
  'refund.created',
  'dispute.created',
  'dispute.closed',
];
