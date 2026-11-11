import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createMerchant } from '@/lib/merchants/merchants';
import { addHours } from '@/lib/time';
import { createTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { describeKeys, findMerchantBySecretKey, hashKey, rollSecretKey } from './keys';

let db: Db;
const now = new Date('2026-11-11T10:00:00Z');
beforeEach(async () => {
  db = await createTestDb();
});

describe('keys', () => {
  it('hashes with sha-256 hex', () => {
    expect(hashKey('sk_test_x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps a rolled secret working for 24 hours (PS-AUTH-007)', async () => {
    const user = await makeUser(db);
    const { merchant, secretKey } = await createMerchant(db, user.id, 'Chai Code Co.');
    const fresh = await rollSecretKey(db, merchant.id, now);
    expect(fresh).not.toBe(secretKey);
    expect(await findMerchantBySecretKey(db, secretKey, addHours(now, 23))).toBe(merchant.id);
    expect(await findMerchantBySecretKey(db, secretKey, addHours(now, 25))).toBeNull();
    expect(await findMerchantBySecretKey(db, fresh, addHours(now, 25))).toBe(merchant.id);
  });

  it('does not find unknown keys', async () => {
    expect(await findMerchantBySecretKey(db, 'sk_test_nope', now)).toBeNull();
  });

  it('describes keys for the dashboard: full publishable, last 4 of the active secret', async () => {
    const user = await makeUser(db);
    const { merchant, publishableKey } = await createMerchant(db, user.id, 'Chai Code Co.');
    const fresh = await rollSecretKey(db, merchant.id, now);
    expect(await describeKeys(db, merchant.id)).toEqual({ publishableKey, secretLast4: fresh.slice(-4) });
  });
});
