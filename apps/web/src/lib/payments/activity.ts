import type { Db } from '@/lib/db/client';
import { paymentActivity } from '@/lib/db/schema';
import { newId } from '@/lib/ids';

/** Appends timeline rows; `seq` keeps their order even when they share a timestamp. */
export async function addActivity(
  tx: Db,
  rows: { checkoutSessionId: string; paymentId: string; kind: string; message: string; detail?: object }[],
  now: Date,
) {
  await tx.insert(paymentActivity).values(rows.map((r) => ({ id: newId('act'), detail: null, ...r, createdAt: now })));
}
