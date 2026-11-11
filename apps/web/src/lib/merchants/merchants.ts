import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { CURRENCY_INFO, type Currency, parseCurrency } from '@/lib/currency';
import { checkoutSessions, merchants } from '@/lib/db/schema';
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

export class MerchantCurrencyError extends Error {}

export async function createMerchant(db: Db, userId: string, name: string, currency: Currency = 'pkr') {
  const problem = validateMerchantName(name);
  if (problem) throw new MerchantNameError(problem);
  if (!parseCurrency(currency)) throw new MerchantCurrencyError('Choose one of the offered currencies.');

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [{ n }] = await t
      .select({ n: count() })
      .from(merchants)
      .where(and(eq(merchants.ownerUserId, userId), eq(merchants.isGuest, false)));
    if (n >= MAX_MERCHANTS_PER_USER) throw new MerchantLimitError();

    const [merchant] = await t.insert(merchants).values({ id: newId('mer'), ownerUserId: userId, name: name.trim(), currency }).returning();
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

/** The project if this user owns it; server actions check this before touching a project. */
export async function getOwnedMerchant(db: Db, userId: string, merchantId: string): Promise<Merchant | null> {
  const [row] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.ownerUserId, userId)));
  return row ?? null;
}

/**
 * Changes the project's currency while it has no checkouts yet. After the first checkout it is locked, so every
 * session, payment, refund and dispute of a project is in one currency and the dashboard totals add up.
 */
export async function changeMerchantCurrency(db: Db, userId: string, merchantId: string, currency: Currency): Promise<Merchant> {
  if (!parseCurrency(currency)) throw new MerchantCurrencyError('Choose one of the offered currencies.');
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [merchant] = await t
      .select()
      .from(merchants)
      .where(and(eq(merchants.id, merchantId), eq(merchants.ownerUserId, userId)))
      .for('update');
    if (!merchant) throw new MerchantCurrencyError('Project not found.');
    const [{ n }] = await t.select({ n: count() }).from(checkoutSessions).where(eq(checkoutSessions.merchantId, merchantId));
    if (n > 0) {
      throw new MerchantCurrencyError(`This project already has checkouts in ${CURRENCY_INFO[merchant.currency].code}, so its currency can't change.`);
    }
    const [row] = await t.update(merchants).set({ currency }).where(eq(merchants.id, merchantId)).returning();
    return row;
  });
}

/** Which of these projects have at least one checkout, so their currency can no longer change. */
export async function projectsWithCheckouts(db: Db, merchantIds: string[]): Promise<Set<string>> {
  if (merchantIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ merchantId: checkoutSessions.merchantId })
    .from(checkoutSessions)
    .where(inArray(checkoutSessions.merchantId, merchantIds));
  return new Set(rows.map((r) => r.merchantId));
}
