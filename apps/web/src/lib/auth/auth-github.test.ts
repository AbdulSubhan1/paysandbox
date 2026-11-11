import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';

const BASE = 'http://localhost:3000';
const ADMIN_ID = 52096622;

let db: Db;
let auth: typeof import('./auth').auth;

/** Stands in for GitHub's token and user APIs; the user returned is chosen by the `code` the callback receives. */
function stubGitHub(profiles: Record<string, { id: number; login: string; email: string }>) {
  let current = '';
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      const body = String(init?.body ?? (input instanceof Request ? await input.clone().text() : ''));
      current = new URLSearchParams(body).get('code') ?? '';
      return Response.json({ access_token: `gho_test_${current}`, token_type: 'bearer', scope: 'read:user,user:email' });
    }
    const p = profiles[current];
    if (url === 'https://api.github.com/user') return Response.json({ id: p.id, login: p.login, name: p.login, email: null, avatar_url: '' });
    if (url === 'https://api.github.com/user/emails') return Response.json([{ email: p.email, primary: true, verified: true }]);
    throw new Error(`unexpected fetch ${url}`);
  });
}

/** Runs the real sign-in → GitHub callback round trip through Better Auth and returns where the browser lands. */
async function signInWithGitHub(code: string): Promise<{ location: string; cookie: string }> {
  const start = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ provider: 'github', callbackURL: '/dashboard/projects', errorCallbackURL: '/invite-only' }),
    }),
  );
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const done = await auth.handler(new Request(`${BASE}/api/auth/callback/github?code=${code}&state=${state}`, { headers: { cookie } }));
  return {
    location: done.headers.get('location') ?? '',
    cookie: done.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
  };
}

beforeAll(async () => {
  vi.stubEnv('E2E_AUTH_BYPASS', '');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-test-secret-test-secret-123');
  vi.stubEnv('BETTER_AUTH_URL', BASE);
  vi.stubEnv('GITHUB_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('ADMIN_GITHUB_IDS', String(ADMIN_ID));
  stubGitHub({
    admin: { id: ADMIN_ID, login: 'AbdulSubhan1', email: 'admin@example.com' },
    stranger: { id: 999, login: 'stranger', email: 'stranger@example.com' },
  });
  db = await createTestDb();
  ({ auth } = await import('./auth'));
});

describe('GitHub sign-in through Better Auth', () => {
  it('lets an admin GitHub ID sign up and stores the GitHub identity', async () => {
    const { location } = await signInWithGitHub('admin');
    expect(location).not.toContain('error');
    expect(location).toContain('/dashboard/projects');
    const [row] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
    expect(row).toMatchObject({ githubUserId: String(ADMIN_ID), githubLogin: 'abdulsubhan1', isAdmin: true });
  });

  it('refuses a GitHub account that is not invited and creates no user (PS-AUTH-012)', async () => {
    const { location } = await signInWithGitHub('stranger');
    expect(location).toContain('/invite-only');
    expect(await db.select().from(users).where(eq(users.email, 'stranger@example.com'))).toHaveLength(0);
  });

  it('does not let a signed-in user change their GitHub identity', async () => {
    const { cookie } = await signInWithGitHub('admin');
    await auth.handler(
      new Request(`${BASE}/api/auth/update-user`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE, cookie },
        body: JSON.stringify({ name: 'Renamed', githubUserId: '1', githubLogin: 'someone-else', isAdmin: false }),
      }),
    );
    const [row] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
    expect(row).toMatchObject({ name: 'Renamed', githubUserId: String(ADMIN_ID), githubLogin: 'abdulsubhan1', isAdmin: true });
  });
});
