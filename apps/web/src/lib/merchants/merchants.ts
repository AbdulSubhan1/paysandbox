import { and, asc, count, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { merchants } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { createKeyPair } from '@/lib/keys/keys';
import { validateMerchantName } from './names';

export const MAX_MERCHANTS_PER_USER = 3;

export type Merchant = typeof merchants.$inferSelect;

export class MerchantLimitError extends Error {
  constructor() {
    super(`You can have up to ${MAX_MERCHANTS_PER_USER} projects.`);
  }
}

export class MerchantNameError extends Error {}

export async function createMerchant(db: Db, userId: string, name: string) {
  const problem = validateMerchantName(name);
  if (problem) throw new MerchantNameError(problem);

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [{ n }] = await t
      .select({ n: count() })
      .from(merchants)
      .where(and(eq(merchants.ownerUserId, userId), eq(merchants.isGuest, false)));
    if (n >= MAX_MERCHANTS_PER_USER) throw new MerchantLimitError();

    const [merchant] = await t.insert(merchants).values({ id: newId('mer'), ownerUserId: userId, name: name.trim() }).returning();
    const keys = await createKeyPair(t, merchant.id);
    return { merchant, ...keys };
  });
}

export async function listMerchants(db: Db, userId: string): Promise<Merchant[]> {
  return db
    .select()
    .from(merchants)
    .where(and(eq(merchants.ownerUserId, userId), eq(merchants.isGuest, false)))
    .orderBy(asc(merchants.createdAt));
}
