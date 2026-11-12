import { and, count, desc, eq, gte, inArray, min, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, disputes, events, payments, refunds, webhookDeliveries } from '@/lib/db/schema';
import type { PaymentStatus } from '@/lib/payments/state';
import { type Range, rangeDays, rangeStart } from './range';

export type DashboardPaymentRow = {
  id: string;
  merchantId: string;
  amount: number;
  amountRefunded: number;
  status: PaymentStatus;
  cardBrand: string;
  cardLast4: string;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  /** The first line item's name: what the payment was for. */
  description: string | null;
};

export type EventListRow = {
  id: string;
  type: string;
  createdAt: Date;
  delivery: { state: 'pending' | 'delivered' | 'failed'; attemptCount: number; nextAttemptAt: Date | null } | null;
};

type Total = { amount: number; count: number };
export type Overview = {
  /** Captured payments made in the range, before refunds and disputes. */
  successful: Total & { rate: number | null };
  /** Refunded so far on those payments; `count` is refunds, not payments. */
  refunded: Total;
  /** Disputes on those payments that were lost (money gone) or are still open (money on hold). */
  disputesLost: Total;
  disputesOpen: Total;
  /** successful − refunded − lost disputes. */
  netVolume: number;
  /** Successful volume per Karachi day of the range, oldest first; sums to `successful.amount`. */
  daily: { day: string; amount: number }[];
  attention: { openDisputes: number; respondBy: Date | null; failingWebhooks: number; waitingOtp: number; declines: number };
  /** Payments ever, in any range: zero means the project has never taken one. */
  allTime: number;
  recentPayments: DashboardPaymentRow[];
};

/** Statuses whose amount was captured (design: net = succeeded volume − refunded − lost disputes). */
export const CAPTURED: PaymentStatus[] = ['succeeded', 'partially_refunded', 'refunded', 'disputed', 'dispute_lost'];

export const paymentRowColumns = {
  id: payments.id,
  merchantId: payments.merchantId,
  amount: payments.amount,
  amountRefunded: payments.amountRefunded,
  status: payments.status,
  cardBrand: payments.cardBrand,
  cardLast4: payments.cardLast4,
  createdAt: payments.createdAt,
  customerName: customers.name,
  customerEmail: customers.email,
  description: sql<string | null>`${checkoutSessions.lineItems}->0->>'name'`,
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

/** The Karachi calendar day of a payment, independent of the database's own time zone. */
const karachiDayOf = sql<string>`to_char((${payments.createdAt} at time zone 'UTC') + interval '5 hours', 'YYYY-MM-DD')`;

type StatusRow = { status: PaymentStatus; count: number; amount: number; refunded: number };
type DisputeRow = { status: 'needs_response' | 'won' | 'lost'; count: number; amount: number };

/** The money tiles from per-status sums. Kept pure so the arithmetic is tested on its own. */
export function moneyTotals(byStatus: StatusRow[], byDispute: DisputeRow[], refundCount: number) {
  const captured = byStatus.filter((r) => CAPTURED.includes(r.status));
  const successful = { amount: captured.reduce((n, r) => n + r.amount, 0), count: captured.reduce((n, r) => n + r.count, 0) };
  const failed = byStatus.find((r) => r.status === 'failed')?.count ?? 0;
  const attempts = successful.count + failed; // payments still waiting for an OTP have no outcome yet
  const refunded = { amount: byStatus.reduce((n, r) => n + r.refunded, 0), count: refundCount };
  const dispute = (s: DisputeRow['status']) => {
    const r = byDispute.find((d) => d.status === s);
    return { amount: r?.amount ?? 0, count: r?.count ?? 0 };
  };
  const disputesLost = dispute('lost');
  return {
    successful: { ...successful, rate: attempts ? successful.count / attempts : null },
    refunded,
    disputesLost,
    disputesOpen: dispute('needs_response'),
    netVolume: successful.amount - refunded.amount - disputesLost.amount,
  };
}

/** One bar per day of the range, zero where nothing succeeded. */
export function dailySeries(days: string[], rows: { day: string; amount: number }[]): { day: string; amount: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r.amount]));
  return days.map((day) => ({ day, amount: byDay.get(day) ?? 0 }));
}

/**
 * The overview for one project and date range. Money is counted by the day the payment was made: a later refund or
 * dispute counts against its payment, so the tiles always add up (net = successful − refunded − lost disputes).
 */
export async function getOverview(db: Db, merchantId: string, range: Range, now: Date): Promise<Overview> {
  const start = rangeStart(range, now);
  const inRange = and(eq(payments.merchantId, merchantId), gte(payments.createdAt, start));

  const [byStatus, byDispute, [refundRows], dailyRows, [open], [failing], [all], recentPayments] = await Promise.all([
    db
      .select({
        status: payments.status,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        refunded: sql<string>`coalesce(sum(${payments.amountRefunded}), 0)`,
      })
      .from(payments)
      .where(inRange)
      .groupBy(payments.status),
    db
      .select({ status: disputes.status, count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${disputes.amount}), 0)` })
      .from(disputes)
      .innerJoin(payments, eq(payments.id, disputes.paymentId))
      .where(inRange)
      .groupBy(disputes.status),
    db.select({ n: count() }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(inRange),
    db
      .select({ day: karachiDayOf, amount: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(and(inRange, inArray(payments.status, CAPTURED)))
      .groupBy(karachiDayOf),
    // An open dispute needs an answer whenever its payment was made, so it ignores the range.
    db
      .select({ n: count(), respondBy: min(disputes.respondBy) })
      .from(disputes)
      .where(and(eq(disputes.merchantId, merchantId), eq(disputes.status, 'needs_response'))),
    // Failed for good, or failed at least once and waiting for a retry.
    db
      .select({ n: count() })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.merchantId, merchantId),
          gte(webhookDeliveries.createdAt, start),
          or(eq(webhookDeliveries.state, 'failed'), and(eq(webhookDeliveries.state, 'pending'), sql`${webhookDeliveries.attemptCount} > 0`)),
        ),
      ),
    db.select({ n: count() }).from(payments).where(eq(payments.merchantId, merchantId)),
    db
      .select(paymentRowColumns)
      .from(payments)
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .innerJoin(checkoutSessions, eq(checkoutSessions.id, payments.checkoutSessionId))
      .where(eq(payments.merchantId, merchantId))
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(5),
  ]);

  const statusRows = byStatus.map((r) => ({ ...r, amount: Number(r.amount), refunded: Number(r.refunded) }));
  const countOf = (s: PaymentStatus) => statusRows.find((r) => r.status === s)?.count ?? 0;
  return {
    ...moneyTotals(
      statusRows,
      byDispute.map((r) => ({ ...r, amount: Number(r.amount) })),
      refundRows.n,
    ),
    daily: dailySeries(
      rangeDays(range, now),
      dailyRows.map((r) => ({ day: r.day, amount: Number(r.amount) })),
    ),
    attention: {
      openDisputes: open.n,
      respondBy: open.respondBy,
      failingWebhooks: failing.n,
      waitingOtp: countOf('requires_action'),
      declines: countOf('failed'),
    },
    allTime: all.n,
    recentPayments,
  };
}
