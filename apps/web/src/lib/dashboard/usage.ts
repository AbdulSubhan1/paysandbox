import { and, eq } from 'drizzle-orm';
import { CAPS, type UsageCounter } from '@/lib/api/usage';
import type { Db } from '@/lib/db/client';
import { usageDaily } from '@/lib/db/schema';
import { karachiDay } from '@/lib/time';

/** Today's usage (Pakistan calendar day) against each cap. A read only: it never creates the usage row. */
export async function getUsageToday(db: Db, merchantId: string, now: Date): Promise<Record<UsageCounter, { used: number; cap: number }>> {
  const [row] = await db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.merchantId, merchantId), eq(usageDaily.day, karachiDay(now))));
  return {
    api_requests: { used: row?.apiRequests ?? 0, cap: CAPS.api_requests },
    checkout_sessions: { used: row?.checkoutSessions ?? 0, cap: CAPS.checkout_sessions },
    webhook_attempts: { used: row?.webhookAttempts ?? 0, cap: CAPS.webhook_attempts },
    test_events: { used: row?.testEvents ?? 0, cap: CAPS.test_events },
  };
}
