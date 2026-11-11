import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { findMerchantBySecretKey } from '@/lib/keys/keys';
import { createTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { createMerchant, listMerchants, MerchantLimitError } from './merchants';
import { validateMerchantName } from './names';

describe('validateMerchantName', () => {
  it('accepts a normal store name', () => expect(validateMerchantName('Chai Code Co.')).toBeNull());
  it('refuses 1 character and 41 characters', () => {
    expect(validateMerchantName('C')).not.toBeNull();
    expect(validateMerchantName('x'.repeat(41))).not.toBeNull();
  });
  it('refuses real bank and wallet names as whole words', () => {
    expect(validateMerchantName('HBL Payments')).not.toBeNull();
    expect(validateMerchantName('jazzcash store')).not.toBeNull();
    expect(validateMerchantName('Bank Alfalah Demo')).not.toBeNull();
  });
  it('allows a blocked word inside another word', () => expect(validateMerchantName('Shubleen Crafts')).toBeNull());
});

describe('createMerchant', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('returns keys once and stores only a hash of the secret (PS-DEV-003)', async () => {
    const user = await makeUser(db);
    const { merchant, publishableKey, secretKey } = await createMerchant(db, user.id, 'Chai Code Co.');
    expect(publishableKey).toMatch(/^pk_test_[0-9A-Za-z]{24}$/);
    expect(secretKey).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.merchantId, merchant.id));
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(secretKey);
    expect(rows.find((r) => r.type === 'secret')?.last4).toBe(secretKey.slice(-4));
    expect(await findMerchantBySecretKey(db, secretKey, new Date())).toBe(merchant.id);
  });

  it('allows at most 3 projects per user (PS-AUTH-014)', async () => {
    const user = await makeUser(db);
    await createMerchant(db, user.id, 'One');
    await createMerchant(db, user.id, 'Two');
    await createMerchant(db, user.id, 'Three');
    await expect(createMerchant(db, user.id, 'Four')).rejects.toBeInstanceOf(MerchantLimitError);
    expect(await listMerchants(db, user.id)).toHaveLength(3);
  });

  it('refuses an invalid name', async () => {
    const user = await makeUser(db);
    await expect(createMerchant(db, user.id, 'HBL')).rejects.toThrow();
  });
});
