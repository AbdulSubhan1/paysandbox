import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { usageDaily } from '@/lib/db/schema';
import { karachiDay } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeMerchant } from '@/test/factories';
import { getUsageToday } from './usage';

let db: Db;
let m: string;
const now = new Date('2026-11-11T10:00:00Z');
beforeEach(async () => {
  db = await createTestDb();
  m = (await makeMerchant(db)).id;
});

describe('getUsageToday', () => {
  it('reads zeros with the caps, and never inserts a row', async () => {
    expect(await getUsageToday(db, m, now)).toEqual({
      api_requests: { used: 0, cap: 1000 },
      checkout_sessions: { used: 0, cap: 200 },
      webhook_attempts: { used: 0, cap: 200 },
      test_events: { used: 0, cap: 50 },
    });
    expect(await db.select().from(usageDaily)).toEqual([]);
  });

  it("returns today's counts in Pakistan time", async () => {
    await db.insert(usageDaily).values({ merchantId: m, day: karachiDay(now), apiRequests: 12, checkoutSessions: 3, webhookAttempts: 7, testEvents: 2 });
    await db.insert(usageDaily).values({ merchantId: m, day: '2026-11-10', apiRequests: 999 });
    const u = await getUsageToday(db, m, now);
    expect([u.api_requests.used, u.checkout_sessions.used, u.webhook_attempts.used, u.test_events.used]).toEqual([12, 3, 7, 2]);
  });
});
