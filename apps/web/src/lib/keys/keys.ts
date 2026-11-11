import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { newId, randomBase62 } from '@/lib/ids';
import { addHours } from '@/lib/time';

const ROLL_GRACE_HOURS = 24;

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Creates a key pair. The secret is returned once and only its hash is stored. */
export async function createKeyPair(db: Db, merchantId: string): Promise<{ publishableKey: string; secretKey: string }> {
  const publishableKey = `pk_test_${randomBase62(24)}`;
  const secretKey = await insertSecretKey(db, merchantId);
  await db.insert(apiKeys).values({
    id: newId('key'),
    merchantId,
    type: 'publishable',
    prefix: 'pk_test_',
    last4: publishableKey.slice(-4),
    publishableValue: publishableKey,
  });
  return { publishableKey, secretKey };
}

async function insertSecretKey(db: Db, merchantId: string): Promise<string> {
  const secretKey = `sk_test_${randomBase62(32)}`;
  await db.insert(apiKeys).values({
    id: newId('key'),
    merchantId,
    type: 'secret',
    prefix: 'sk_test_',
    last4: secretKey.slice(-4),
    keyHash: hashKey(secretKey),
  });
  return secretKey;
}

/** New secret key now; the current one keeps working for 24 hours. */
export async function rollSecretKey(db: Db, merchantId: string, now: Date): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ expiresAt: addHours(now, ROLL_GRACE_HOURS) })
      .where(and(eq(apiKeys.merchantId, merchantId), eq(apiKeys.type, 'secret'), isNull(apiKeys.expiresAt)));
    return insertSecretKey(tx as unknown as Db, merchantId);
  });
}

export async function findMerchantBySecretKey(db: Db, key: string, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ merchantId: apiKeys.merchantId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))))
    .limit(1);
  return row?.merchantId ?? null;
}

export type MerchantKeys = { publishableKey: string | null; secretLast4: string | null };

/** What the dashboard may show: the publishable key in full, the active secret key as its last 4 only. */
export async function describeKeys(db: Db, merchantId: string): Promise<MerchantKeys> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.merchantId, merchantId));
  const secret = rows.filter((r) => r.type === 'secret' && r.expiresAt === null).at(-1);
  return {
    publishableKey: rows.find((r) => r.type === 'publishable')?.publishableValue ?? null,
    secretLast4: secret?.last4 ?? null,
  };
}
