import type { Db } from '@/lib/db/client';
import { checkoutSessions, merchants, users } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { addHours } from '@/lib/time';

export async function makeUser(db: Db, overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = newId('usr');
  const [row] = await db
    .insert(users)
    .values({ id, name: 'Test User', email: `${id}@example.com`, githubLogin: id.toLowerCase(), ...overrides })
    .returning();
  return row;
}

export async function makeMerchant(db: Db, opts: { userId?: string; name?: string } = {}) {
  const [row] = await db
    .insert(merchants)
    .values({ id: newId('mer'), ownerUserId: opts.userId ?? null, name: opts.name ?? 'Chai Code Co.' })
    .returning();
  return row;
}

export async function makeSession(db: Db, merchantId: string, overrides: Partial<typeof checkoutSessions.$inferInsert> = {}) {
  const now = new Date();
  const [row] = await db
    .insert(checkoutSessions)
    .values({
      id: newId('cs_test'),
      merchantId,
      amount: 510000,
      lineItems: [{ name: 'Developer hoodie', quantity: 1, amount: 510000 }],
      successUrl: 'https://my-store.test/thanks',
      cancelUrl: 'https://my-store.test/cart',
      expiresAt: addHours(now, 24),
      ...overrides,
    })
    .returning();
  return row;
}
