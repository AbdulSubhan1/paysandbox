import type { Db } from '@/lib/db/client';
import { apiKeys, merchants } from '@/lib/db/schema';
import { hashKey } from '@/lib/keys/keys';

/** Fixed test-only keys for the E2E database. They exist nowhere else. */
export const E2E = {
  merchantA: { id: 'mer_e2eMerchantA00000000000000', name: 'Chai Code Co.', sk: 'sk_test_e2eMerchantAsecret000000000000' },
  merchantB: { id: 'mer_e2eMerchantB00000000000000', name: 'Other Shop', sk: 'sk_test_e2eMerchantBsecret000000000000' },
} as const;

export async function seedE2E(db: Db): Promise<typeof E2E> {
  if (process.env.E2E_AUTH_BYPASS !== '1' || process.env.VERCEL) throw new Error('seedE2E only runs in E2E mode');
  for (const m of [E2E.merchantA, E2E.merchantB]) {
    await db.insert(merchants).values({ id: m.id, name: m.name }).onConflictDoNothing();
    await db
      .insert(apiKeys)
      .values({ id: `key_${m.id.slice(4)}`, merchantId: m.id, type: 'secret', prefix: 'sk_test_', last4: m.sk.slice(-4), keyHash: hashKey(m.sk) })
      .onConflictDoNothing();
  }
  return E2E;
}
