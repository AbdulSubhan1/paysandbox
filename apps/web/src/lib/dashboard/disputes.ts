import { eq, sql } from 'drizzle-orm';
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
