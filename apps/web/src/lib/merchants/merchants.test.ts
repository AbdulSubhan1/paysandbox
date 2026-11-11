import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { findMerchantBySecretKey } from '@/lib/keys/keys';
import { createTestDb } from '@/test/db';
import { makeUser } from '@/test/factories';
import { makeSession } from '@/test/factories';
import { changeMerchantCurrency, createMerchant, projectsWithCheckouts, getOwnedMerchant, listMerchants, MerchantCurrencyError, MerchantLimitError } from './merchants';
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

describe('getOwnedMerchant', () => {
  it("returns the user's own project and nobody else's", async () => {
    const db = await createTestDb();
    const owner = await makeUser(db);
    const stranger = await makeUser(db);
    const { merchant } = await createMerchant(db, owner.id, 'Owned Shop');
    expect((await getOwnedMerchant(db, owner.id, merchant.id))?.name).toBe('Owned Shop');
    expect(await getOwnedMerchant(db, stranger.id, merchant.id)).toBeNull();
  });
});

describe('project currency', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('is PKR unless another currency is chosen at creation', async () => {
    const user = await makeUser(db);
    expect((await createMerchant(db, user.id, 'Rupee Shop')).merchant.currency).toBe('pkr');
    expect((await createMerchant(db, user.id, 'Dollar Shop', 'usd')).merchant.currency).toBe('usd');
  });

  it('refuses a currency PaySandbox does not offer', async () => {
    const user = await makeUser(db);
    await expect(createMerchant(db, user.id, 'Rupee Shop', 'inr' as never)).rejects.toBeInstanceOf(MerchantCurrencyError);
  });

  it('can change while the project has no checkouts, then is locked', async () => {
    const user = await makeUser(db);
    const { merchant } = await createMerchant(db, user.id, 'Insurance Site');
    expect((await changeMerchantCurrency(db, user.id, merchant.id, 'usd')).currency).toBe('usd');
    await makeSession(db, merchant.id, { currency: 'usd' });
    await expect(changeMerchantCurrency(db, user.id, merchant.id, 'aed')).rejects.toBeInstanceOf(MerchantCurrencyError);
    expect((await getOwnedMerchant(db, user.id, merchant.id))?.currency).toBe('usd');
  });

  it("refuses to change someone else's project", async () => {
    const owner = await makeUser(db);
    const stranger = await makeUser(db);
    const { merchant } = await createMerchant(db, owner.id, 'Owned Shop');
    await expect(changeMerchantCurrency(db, stranger.id, merchant.id, 'usd')).rejects.toBeInstanceOf(MerchantCurrencyError);
  });

  it('tells which projects already have checkouts (their currency is locked)', async () => {
    const user = await makeUser(db);
    const a = (await createMerchant(db, user.id, 'Has Checkouts')).merchant.id;
    const b = (await createMerchant(db, user.id, 'Fresh Project')).merchant.id;
    await makeSession(db, a);
    expect(await projectsWithCheckouts(db, [a, b])).toEqual(new Set([a]));
    expect(await projectsWithCheckouts(db, [])).toEqual(new Set());
  });
});
