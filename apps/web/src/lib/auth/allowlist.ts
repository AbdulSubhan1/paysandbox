import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { signupAllowlist } from '@/lib/db/schema';

export type SignUpProfile = { githubId: string; login: string; email?: string };

export type SignUpDeps = {
  adminIds: string[];
  isAllowlisted: (login: string) => Promise<boolean>;
  /** Only true when E2E_AUTH_BYPASS=1 and not running on Vercel. */
  e2eMode: boolean;
};

export async function isAllowedToSignUp(profile: SignUpProfile, deps: SignUpDeps): Promise<boolean> {
  if (profile.githubId && deps.adminIds.includes(profile.githubId)) return true;
  if (profile.login && (await deps.isAllowlisted(profile.login.toLowerCase()))) return true;
  return deps.e2eMode && !!profile.email?.toLowerCase().endsWith('@e2e.test');
}

export function allowlistLookup(db: Db) {
  return async (login: string) =>
    (await db.select().from(signupAllowlist).where(eq(signupAllowlist.githubLogin, login.toLowerCase())).limit(1)).length > 0;
}

export function adminIdsFromEnv(): string[] {
  return (process.env.ADMIN_GITHUB_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isE2eMode(): boolean {
  return process.env.E2E_AUTH_BYPASS === '1' && !process.env.VERCEL;
}
