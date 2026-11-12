import { and, count, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { customers, disputes, payments } from '@/lib/db/schema';
import type { DisputeRow } from '@/lib/disputes/disputes';

/** Open disputes first (soonest respond-by first), then closed ones, newest first. */
export async function listDisputes(db: Db, merchantId: string): Promise<(DisputeRow & { customerName: string })[]> {
  const rows = await db
    .select({ dispute: disputes, customerName: customers.name })
    .from(disputes)
    .innerJoin(payments, eq(payments.id, disputes.paymentId))
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(eq(disputes.merchantId, merchantId))
    .orderBy(
      sql`(${disputes.status} <> 'needs_response')`,
      sql`case when ${disputes.status} = 'needs_response' then ${disputes.respondBy} end asc`,
      sql`${disputes.createdAt} desc`,
    );
  return rows.map((r) => ({ ...r.dispute, customerName: r.customerName }));
}

/** Disputes waiting for the merchant's answer: the sidebar badge. */
export async function countOpenDisputes(db: Db, merchantId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(disputes)
    .where(and(eq(disputes.merchantId, merchantId), eq(disputes.status, 'needs_response')));
  return r.n;
}
