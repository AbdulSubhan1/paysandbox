import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createTestDb } from '@/test/db';
import { makeMerchant, makeUser } from '@/test/factories';

const session = { userId: '' };
vi.mock('@/lib/auth/session', () => ({ requireUser: async () => ({ id: session.userId, githubLogin: 'me', isAdmin: false }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { requireProject } = await import('./require-project');

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe('requireProject (Plan 3 Review Focus 1)', () => {
  it("returns the user's project and their project list", async () => {
    const me = await makeUser(db);
    const mine = await makeMerchant(db, { userId: me.id, name: 'Mine' });
    await makeMerchant(db, { userId: me.id, name: 'Second' });
    session.userId = me.id;
    const r = await requireProject(mine.id);
    expect(r.merchant.name).toBe('Mine');
    expect(r.projects.map((p) => p.name).sort()).toEqual(['Mine', 'Second']);
  });

  it("is not found for someone else's project or an unknown id", async () => {
    const me = await makeUser(db);
    const other = await makeUser(db);
    const theirs = await makeMerchant(db, { userId: other.id });
    session.userId = me.id;
    await expect(requireProject(theirs.id)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(requireProject('mer_doesnotexist0000000000000')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
