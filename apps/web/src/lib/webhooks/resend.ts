import { and, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/jobs';

/**
 * "Resend now": one more attempt of the event's existing delivery, now, with the same webhook-id. The attempt count
 * carries on, so a failure ends the delivery as failed again instead of restarting the retry schedule.
 */
export async function resendEvent(
  db: Db,
  merchantId: string,
  eventId: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: 'no_delivery' | 'endpoint_disabled' | 'in_progress' }> {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [row] = await tx
      .select({ delivery: webhookDeliveries, enabled: webhookEndpoints.enabled })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .where(and(eq(webhookDeliveries.eventId, eventId), eq(webhookDeliveries.merchantId, merchantId)))
      .for('update', { of: webhookDeliveries });
    if (!row) return { ok: false, reason: 'no_delivery' };
    if (!row.enabled) return { ok: false, reason: 'endpoint_disabled' };
    const d = row.delivery;
    // Pending means an attempt is on its way or a retry is scheduled: resending then would send twice.
    if (d.state === 'pending') return { ok: false, reason: 'in_progress' };
    await tx
      .update(webhookDeliveries)
      .set({ state: 'pending', nextAttemptAt: now, updatedAt: now })
      .where(eq(webhookDeliveries.id, d.id));
    await enqueueJob(tx, { merchantId, kind: 'deliver_webhook', refId: d.id, runAt: now, now });
    return { ok: true };
  });
}
