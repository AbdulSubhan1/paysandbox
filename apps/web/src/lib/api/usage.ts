import { sql } from 'drizzle-orm';
import type { Currency } from '@/lib/currency';
import type { Db } from '@/lib/db/client';
import { apiKeys, merchants, usageDaily } from '@/lib/db/schema';
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

/**
 * Finds the merchant for a secret-key hash (not expired) and counts one API request, in one statement, so an API
 * call spends one database round trip before its handler instead of two. Null = no such key; nothing is counted.
 */
export async function countRequestForKey(db: Db, keyHash: string, now: Date): Promise<{ merchantId: string; currency: Currency; usage: UsageResult } | null> {
  const res = await db.execute(sql`
    with k as (
      select ${apiKeys.merchantId} as merchant_id from ${apiKeys}
      where ${apiKeys.keyHash} = ${keyHash} and (${apiKeys.expiresAt} is null or ${apiKeys.expiresAt} > ${now.toISOString()}::timestamptz)
      limit 1
    )
    , u as (
      insert into ${usageDaily} (merchant_id, day, api_requests)
      select merchant_id, ${karachiDay(now)}, 1 from k
      on conflict (merchant_id, day) do update set api_requests = ${usageDaily}.api_requests + 1
      returning merchant_id, api_requests
    )
    select u.merchant_id, u.api_requests, ${merchants.currency} as currency
    from u join ${merchants} on ${merchants.id} = u.merchant_id`);
  const [row] = (res as unknown as { rows: { merchant_id: string; api_requests: number; currency: Currency }[] }).rows;
  if (!row) return null;
  const used = Number(row.api_requests);
  return {
    merchantId: row.merchant_id,
    currency: row.currency,
    usage: { allowed: used <= CAPS.api_requests, used, cap: CAPS.api_requests, retryAfterSeconds: secondsUntilKarachiMidnight(now) },
  };
}
