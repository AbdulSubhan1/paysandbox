import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, merchants, payments, users } from '@/lib/db/schema';
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

/** A payment on its own session and customer; succeeded with the 4242 card unless overridden. */
export async function makePayment(db: Db, merchantId: string, overrides: Partial<typeof payments.$inferInsert> = {}) {
  const session = overrides.checkoutSessionId ? null : await makeSession(db, merchantId);
  let customerId = overrides.customerId;
  if (!customerId) {
    const id = newId('cus');
    await db.insert(customers).values({ id, merchantId, email: `${id.toLowerCase()}@example.com`, name: 'Ayesha Khan' });
    customerId = id;
  }
  const [row] = await db
    .insert(payments)
    .values({
      id: newId('pay'),
      merchantId,
      checkoutSessionId: session?.id ?? overrides.checkoutSessionId!,
      customerId,
      attemptId: newId('req'),
      amount: 510000,
      status: 'succeeded',
      cardBrand: 'visa',
      cardLast4: '4242',
      testCard: 'visa_success',
      ...overrides,
    })
    .returning();
  return row;
}
