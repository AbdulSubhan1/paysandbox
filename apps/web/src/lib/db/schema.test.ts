import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { createTestDb } from '@/test/db';
import { makeMerchant, makeSession, makeUser } from '@/test/factories';
import type { Db } from './client';
import { customers } from './schema';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('schema', () => {
  it('stores a checkout session for a merchant', async () => {
    const user = await makeUser(db);
    const m = await makeMerchant(db, { userId: user.id });
    const s = await makeSession(db, m.id, { amount: 510000 });
    expect(s.amount).toBe(510000);
    expect(s.status).toBe('open');
    expect(s.currency).toBe('pkr');
  });

  it('keeps one customer per email per merchant', async () => {
    const m = await makeMerchant(db);
    const row = () => ({ id: newId('cus'), merchantId: m.id, email: 'a@x.pk', name: 'A' });
    await db.insert(customers).values(row());
    await expect(db.insert(customers).values(row())).rejects.toThrow();
  });
});
