import type { payments } from '@/lib/db/schema';

export type PaymentStatus = (typeof payments.$inferSelect)['status'];

/** Allowed status changes (design §6). `null` is a new payment. */
const NEXT: Record<PaymentStatus | 'new', readonly PaymentStatus[]> = {
  new: ['succeeded', 'failed', 'requires_action'],
  requires_action: ['succeeded', 'failed'],
  succeeded: ['partially_refunded', 'refunded', 'disputed'],
  partially_refunded: ['partially_refunded', 'refunded', 'disputed'],
  disputed: ['succeeded', 'partially_refunded', 'dispute_lost'], // won → back to the status before the dispute
  failed: [],
  refunded: [],
  dispute_lost: [],
};

export function canTransition(from: PaymentStatus | null, to: PaymentStatus): boolean {
  return NEXT[from ?? 'new'].includes(to);
}

/** Every status change in the engines goes through this, so an illegal one fails loudly instead of being stored. */
export function assertTransition(from: PaymentStatus | null, to: PaymentStatus): void {
  if (!canTransition(from, to)) throw new Error(`Illegal payment status change: ${from ?? 'new'} → ${to}`);
}
