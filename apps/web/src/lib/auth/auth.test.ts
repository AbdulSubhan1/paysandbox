import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';

let db: Db;
let auth: typeof import('./auth').auth;

beforeAll(async () => {
  vi.stubEnv('E2E_AUTH_BYPASS', '1');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-test-secret-test-secret-123');
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  db = await createTestDb();
  ({ auth } = await import('./auth'));
});

describe('better auth with the invite-only hook', () => {
  it('creates a user for an @e2e.test email in E2E mode', async () => {
    await auth.api.signUpEmail({ body: { email: 'qa@e2e.test', password: 'correct-horse-9', name: 'QA' } });
    const [row] = await db.select().from(users).where(eq(users.email, 'qa@e2e.test'));
    expect(row.id).toMatch(/^usr_/);
    expect(row.isAdmin).toBe(false);
  });

  it('creates no user for an address that is not allowed (PS-AUTH-012)', async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: 'stranger@gmail.com', password: 'correct-horse-9', name: 'S' } }),
    ).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.email, 'stranger@gmail.com'))).toHaveLength(0);
  });
});
