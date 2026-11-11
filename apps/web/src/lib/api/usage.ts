import { sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { usageDaily } from '@/lib/db/schema';
import { karachiDay, secondsUntilKarachiMidnight } from '@/lib/time';
import { ApiError } from './errors';

/** Per merchant, per calendar day in Pakistan. Keeps one merchant from using up the free tiers. */
// webhook_attempts: 200, not the design's 500, so one project can't use up the QStash free plan (500 messages a day).
export const CAPS = { api_requests: 1000, checkout_sessions: 200, webhook_attempts: 200, test_events: 50 } as const;
export type UsageCounter = keyof typeof CAPS;

const COLUMNS = {
  api_requests: 'apiRequests',
  checkout_sessions: 'checkoutSessions',
  webhook_attempts: 'webhookAttempts',
  test_events: 'testEvents',
} as const satisfies Record<UsageCounter, keyof typeof usageDaily.$inferSelect>;

export type UsageResult = { allowed: boolean; used: number; cap: number; retryAfterSeconds: number };

/** Counts one use (even when over the cap) and says whether it is allowed. */
export async function consumeUsage(db: Db, merchantId: string, counter: UsageCounter, now: Date): Promise<UsageResult> {
  const column = COLUMNS[counter];
  const [row] = await db
    .insert(usageDaily)
    .values({ merchantId, day: karachiDay(now), [column]: 1 })
    .onConflictDoUpdate({ target: [usageDaily.merchantId, usageDaily.day], set: { [column]: sql`${usageDaily[column]} + 1` } })
    .returning({ used: usageDaily[column] });
  const cap = CAPS[counter];
  return { allowed: row.used <= cap, used: row.used, cap, retryAfterSeconds: secondsUntilKarachiMidnight(now) };
}

const LABELS: Record<UsageCounter, string> = {
  api_requests: 'API requests',
  checkout_sessions: 'checkout sessions',
  webhook_attempts: 'webhook attempts',
  test_events: 'test events',
};

export function dailyLimitError(counter: UsageCounter, usage: UsageResult): ApiError {
  return new ApiError(
    429,
    'rate_limit_error',
    'daily_limit_reached',
    `Daily limit of ${usage.cap} ${LABELS[counter]} reached. It resets at midnight Pakistan time.`,
    undefined,
    { 'Retry-After': String(usage.retryAfterSeconds) },
  );
}
