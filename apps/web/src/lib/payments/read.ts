import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, payments } from '@/lib/db/schema';
import { toPaymentObject } from './objects';

export async function getPayment(db: Db, merchantId: string, id: string) {
  const [row] = await db
    .select({ payment: payments, customer: customers })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(and(eq(payments.id, id), eq(payments.merchantId, merchantId)));
  return row ? toPaymentObject(row.payment, row.customer) : null;
}

/** Newest first; `startingAfter` is the last payment ID of the previous page. */
export async function listPayments(db: Db, merchantId: string, opts: { limit: number; startingAfter: string | null }) {
  let cursor = undefined;
  if (opts.startingAfter) {
    const [after] = await db
      .select({ createdAt: payments.createdAt, id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, opts.startingAfter), eq(payments.merchantId, merchantId)));
    if (after) {
      cursor = or(lt(payments.createdAt, after.createdAt), and(eq(payments.createdAt, after.createdAt), lt(payments.id, after.id)));
    }
  }
  const rows = await db
    .select({ payment: payments, customer: customers })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(and(eq(payments.merchantId, merchantId), cursor))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(opts.limit + 1);
  return {
    object: 'list' as const,
    data: rows.slice(0, opts.limit).map((r) => toPaymentObject(r.payment, r.customer)),
    has_more: rows.length > opts.limit,
  };
}
