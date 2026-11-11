import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, disputes, payments } from '@/lib/db/schema';
import { CAPTURED } from './overview';

export type CustomerListRow = { id: string; name: string; email: string; payments: number; netPaid: number; lastPaymentAt: Date | null };

const captured = sql.join(
  CAPTURED.map((s) => sql`${s}`),
  sql`, `,
);

/** One row per customer (customers are unique per merchant + email), net of refunds and lost disputes. */
export async function listCustomers(db: Db, merchantId: string): Promise<CustomerListRow[]> {
  const last = sql<Date | null>`max(${payments.createdAt})`;
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      payments: sql<number>`count(${payments.id})::int`,
      gross: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} in (${captured})), 0)`,
      refunded: sql<string>`coalesce(sum(${payments.amountRefunded}), 0)`,
      lost: sql<string>`coalesce(sum(${disputes.amount}) filter (where ${disputes.status} = 'lost'), 0)`,
      lastPaymentAt: last,
    })
    .from(customers)
    .leftJoin(payments, eq(payments.customerId, customers.id))
    .leftJoin(disputes, eq(disputes.paymentId, payments.id))
    .where(eq(customers.merchantId, merchantId))
    .groupBy(customers.id)
    .orderBy(sql`${last} desc nulls last`, desc(customers.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    payments: r.payments,
    netPaid: Number(r.gross) - Number(r.refunded) - Number(r.lost),
    lastPaymentAt: r.lastPaymentAt ? new Date(r.lastPaymentAt) : null,
  }));
}
