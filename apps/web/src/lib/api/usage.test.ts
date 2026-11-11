import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createTestDb } from '@/test/db';
import { makeMerchant } from '@/test/factories';
import { CAPS, consumeUsage } from './usage';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('consumeUsage (PS-AUTH-010/011)', () => {
  it('allows up to the cap, then refuses with the seconds to Karachi midnight', async () => {
    const m = await makeMerchant(db);
    const now = new Date('2026-11-11T10:00:00Z'); // 15:00 in Karachi
    for (let i = 0; i < CAPS.checkout_sessions; i++) {
      expect((await consumeUsage(db, m.id, 'checkout_sessions', now)).allowed).toBe(true);
    }
    expect(await consumeUsage(db, m.id, 'checkout_sessions', now)).toEqual({
      allowed: false,
      used: 201,
      cap: 200,
      retryAfterSeconds: 9 * 3600,
    });
  });

  it('starts a new day at Karachi midnight (Review Focus 5)', async () => {
    const m = await makeMerchant(db);
    await consumeUsage(db, m.id, 'api_requests', new Date('2026-11-11T18:59:00Z'));
    expect((await consumeUsage(db, m.id, 'api_requests', new Date('2026-11-11T19:30:00Z'))).used).toBe(1);
  });

  it('counts each merchant and counter separately', async () => {
    const a = await makeMerchant(db);
    const b = await makeMerchant(db);
    const now = new Date();
    await consumeUsage(db, a.id, 'api_requests', now);
    await consumeUsage(db, a.id, 'api_requests', now);
    expect((await consumeUsage(db, b.id, 'api_requests', now)).used).toBe(1);
    expect((await consumeUsage(db, a.id, 'checkout_sessions', now)).used).toBe(1);
  });

  it('has the published caps', () => {
    expect(CAPS).toEqual({ api_requests: 1000, checkout_sessions: 200, webhook_attempts: 500, test_events: 50 });
  });
});
