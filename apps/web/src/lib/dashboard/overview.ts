import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, disputes, events, payments, webhookDeliveries } from '@/lib/db/schema';
import type { PaymentStatus } from '@/lib/payments/state';

export type DashboardPaymentRow = {
  id: string;
  merchantId: string;
  amount: number;
  status: PaymentStatus;
  cardBrand: string;
  cardLast4: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
};

export type EventListRow = {
  id: string;
  type: string;
  createdAt: Date;
  delivery: { state: 'pending' | 'delivered' | 'failed'; attemptCount: number; nextAttemptAt: Date | null } | null;
};

type Tile = { amount: number; count: number };
export type Overview = {
  netVolume: number;
  succeeded: Tile;
  refunded: Tile;
  failed: Tile;
  needsOtp: Tile;
  disputed: Tile;
  statusCounts: Partial<Record<PaymentStatus, number>>;
  recentPayments: DashboardPaymentRow[];
  recentEvents: EventListRow[];
};

/** Statuses whose amount was captured (design: net = succeeded volume − refunded − lost disputes). */
export const CAPTURED: PaymentStatus[] = ['succeeded', 'partially_refunded', 'refunded', 'disputed', 'dispute_lost'];

export const paymentRowColumns = {
  id: payments.id,
  merchantId: payments.merchantId,
  amount: payments.amount,
  status: payments.status,
  cardBrand: payments.cardBrand,
  cardLast4: payments.cardLast4,
  createdAt: payments.createdAt,
  customerName: customers.name,
  customerEmail: customers.email,
};

export const eventRowColumns = {
  id: events.id,
  type: events.type,
  createdAt: events.createdAt,
  state: webhookDeliveries.state,
  attemptCount: webhookDeliveries.attemptCount,
  nextAttemptAt: webhookDeliveries.nextAttemptAt,
};

export function toEventListRow(r: {
  id: string;
  type: string;
  createdAt: Date;
  state: 'pending' | 'delivered' | 'failed' | null;
  attemptCount: number | null;
  nextAttemptAt: Date | null;
}): EventListRow {
  return {
    id: r.id,
    type: r.type,
    createdAt: r.createdAt,
    delivery: r.state ? { state: r.state, attemptCount: r.attemptCount ?? 0, nextAttemptAt: r.nextAttemptAt } : null,
  };
}

const tile = (amount: unknown, count: unknown): Tile => ({ amount: Number(amount ?? 0), count: Number(count ?? 0) });

export async function getOverview(db: Db, merchantId: string): Promise<Overview> {
  const byStatus = await db
    .select({
      status: payments.status,
      count: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      refunded: sql<string>`coalesce(sum(${payments.amountRefunded}), 0)`,
      refundedCount: sql<number>`count(*) filter (where ${payments.amountRefunded} > 0)::int`,
    })
    .from(payments)
    .where(eq(payments.merchantId, merchantId))
    .groupBy(payments.status);
  const byDispute = await db
    .select({ status: disputes.status, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${disputes.amount}), 0)` })
    .from(disputes)
    .where(eq(disputes.merchantId, merchantId))
    .groupBy(disputes.status);

  const s = (status: PaymentStatus) => byStatus.find((r) => r.status === status);
  const d = (status: 'needs_response' | 'won' | 'lost') => byDispute.find((r) => r.status === status);
  const captured = byStatus.filter((r) => CAPTURED.includes(r.status)).reduce((n, r) => n + Number(r.amount), 0);
  const refunded = tile(
    byStatus.reduce((n, r) => n + Number(r.refunded), 0),
    byStatus.reduce((n, r) => n + r.refundedCount, 0),
  );
  const lost = Number(d('lost')?.amount ?? 0);

  const recentPayments = await db
    .select(paymentRowColumns)
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(eq(payments.merchantId, merchantId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(5);
  const recentEvents = await db
    .select(eventRowColumns)
    .from(events)
    .leftJoin(webhookDeliveries, eq(webhookDeliveries.eventId, events.id))
    .where(eq(events.merchantId, merchantId))
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(5);

  return {
    netVolume: captured - refunded.amount - lost,
    succeeded: tile(s('succeeded')?.amount, s('succeeded')?.count),
    refunded,
    failed: tile(s('failed')?.amount, s('failed')?.count),
    needsOtp: tile(s('requires_action')?.amount, s('requires_action')?.count),
    disputed: tile(Number(d('needs_response')?.amount ?? 0) + lost, (d('needs_response')?.count ?? 0) + (d('lost')?.count ?? 0)),
    statusCounts: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    recentPayments,
    recentEvents: recentEvents.map(toEventListRow),
  };
}
