import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, payments } from '@/lib/db/schema';
import type { PaymentStatus } from '@/lib/payments/state';
import { decodeCursor, olderThan, pageOf } from './cursor';
import { type DashboardPaymentRow, paymentRowColumns } from './overview';

export type { DashboardPaymentRow } from './overview';

export const PAYMENTS_PAGE_SIZE = 25;

type Filter = { status?: PaymentStatus; customerEmail?: string };

const scope = (merchantId: string, f: Filter) =>
  and(
    eq(payments.merchantId, merchantId),
    f.status ? eq(payments.status, f.status) : undefined,
    f.customerEmail ? eq(customers.email, f.customerEmail.toLowerCase()) : undefined,
  );

export async function listDashboardPayments(
  db: Db,
  merchantId: string,
  opts: Filter & { before?: string },
): Promise<{ rows: DashboardPaymentRow[]; next: string | null }> {
  const cursor = decodeCursor(opts.before);
  const rows = await db
    .select(paymentRowColumns)
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(and(scope(merchantId, opts), cursor ? olderThan(payments.createdAt, payments.id, cursor) : undefined))
    .orderBy(sql`date_trunc('milliseconds', ${payments.createdAt}) desc`, desc(payments.id))
    .limit(PAYMENTS_PAGE_SIZE + 1);
  return pageOf(rows, PAYMENTS_PAGE_SIZE);
}

/** Counts for the status chips, under the same customer filter as the list. */
export async function paymentStatusCounts(
  db: Db,
  merchantId: string,
  opts: { customerEmail?: string },
): Promise<{ all: number } & Partial<Record<PaymentStatus, number>>> {
  const rows = await db
    .select({ status: payments.status, n: sql<number>`count(*)::int` })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(scope(merchantId, opts))
    .groupBy(payments.status);
  return { all: rows.reduce((t, r) => t + r.n, 0), ...Object.fromEntries(rows.map((r) => [r.status, r.n])) };
}
