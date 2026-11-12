import { and, asc, count, desc, eq, gte, ilike, not, or, type SQL, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, payments } from '@/lib/db/schema';
import type { PaymentStatus } from '@/lib/payments/state';
import { decodeCursor, encodeCursor, newerThan, olderThan } from './cursor';
import { type DashboardPaymentRow, paymentRowColumns } from './overview';

export type { DashboardPaymentRow } from './overview';

export const PAYMENTS_PAGE_SIZE = 25;

/** `q` is a search: a whole `pay_` id, or part of the customer's email or name. `since` is a date range's start. */
export type PaymentFilter = { status?: PaymentStatus; customerEmail?: string; q?: string; since?: Date };

export type PaymentsPage = {
  rows: DashboardPaymentRow[];
  /** Cursors for the older and newer page, null at either end. */
  next: string | null;
  prev: string | null;
  /** "Showing from–(from + rows − 1) of total" under the same filter. */
  from: number;
  total: number;
};

function search(raw: string | undefined): SQL | undefined {
  const q = raw?.trim();
  if (!q) return undefined;
  if (/^pay_[A-Za-z0-9]+$/.test(q)) return eq(payments.id, q);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`; // the search is text, not a LIKE pattern
  return or(ilike(customers.email, like), ilike(customers.name, like));
}

const scope = (merchantId: string, f: PaymentFilter) =>
  and(
    eq(payments.merchantId, merchantId),
    f.status ? eq(payments.status, f.status) : undefined,
    f.customerEmail ? eq(customers.email, f.customerEmail.toLowerCase()) : undefined,
    f.since ? gte(payments.createdAt, f.since) : undefined,
    search(f.q),
  );

const createdMs = sql`date_trunc('milliseconds', ${payments.createdAt})`;

/**
 * One page, newest first. `before` pages to older rows, `after` back to newer ones (keyset paging: stable while
 * new payments arrive). The page's position comes from counting the matching rows ahead of it.
 */
export async function listDashboardPayments(
  db: Db,
  merchantId: string,
  opts: PaymentFilter & { before?: string; after?: string },
): Promise<PaymentsPage> {
  const before = decodeCursor(opts.before);
  const after = before ? null : decodeCursor(opts.after);
  const where = scope(merchantId, opts);
  const rowsQuery = db
    .select(paymentRowColumns)
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .innerJoin(checkoutSessions, eq(checkoutSessions.id, payments.checkoutSessionId));
  const ahead = before
    ? not(olderThan(payments.createdAt, payments.id, before))
    : after
      ? newerThan(payments.createdAt, payments.id, after)
      : sql`false`;

  const [fetched, [pos]] = await Promise.all([
    after
      ? rowsQuery
          .where(and(where, newerThan(payments.createdAt, payments.id, after)))
          .orderBy(sql`${createdMs} asc`, asc(payments.id))
          .limit(PAYMENTS_PAGE_SIZE)
      : rowsQuery
          .where(and(where, before ? olderThan(payments.createdAt, payments.id, before) : undefined))
          .orderBy(sql`${createdMs} desc`, desc(payments.id))
          .limit(PAYMENTS_PAGE_SIZE),
    db
      .select({ total: count(), ahead: sql<number>`(count(*) filter (where ${ahead}))::int` })
      .from(payments)
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .where(where),
  ]);

  const rows = after ? fetched.reverse() : fetched;
  const skipped = after ? pos.ahead - rows.length : pos.ahead; // rows newer than this page
  return {
    rows,
    next: rows.length && skipped + rows.length < pos.total ? encodeCursor(rows[rows.length - 1]) : null,
    prev: rows.length && skipped > 0 ? encodeCursor(rows[0]) : null,
    from: rows.length ? skipped + 1 : 0,
    total: pos.total,
  };
}

/** Counts for the status chips, under the same search, customer and date filter as the list. */
export async function paymentStatusCounts(
  db: Db,
  merchantId: string,
  opts: Omit<PaymentFilter, 'status'>,
): Promise<{ all: number } & Partial<Record<PaymentStatus, number>>> {
  const rows = await db
    .select({ status: payments.status, n: sql<number>`count(*)::int` })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(scope(merchantId, opts))
    .groupBy(payments.status);
  return { all: rows.reduce((t, r) => t + r.n, 0), ...Object.fromEntries(rows.map((r) => [r.status, r.n])) };
}
