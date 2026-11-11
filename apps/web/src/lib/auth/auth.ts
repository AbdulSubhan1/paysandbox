import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { newId, randomBase62 } from '@/lib/ids';
import { adminIdsFromEnv, allowlistLookup, isAllowedToSignUp, isE2eMode } from './allowlist';

const db = getDb();
const e2eMode = isE2eMode();

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
  advanced: {
    database: { generateId: ({ model }) => (model === 'user' ? newId('usr') : randomBase62(32)) },
  },
  emailAndPassword: { enabled: e2eMode }, // test-only login, never on Vercel
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      mapProfileToUser: (profile) => ({ githubUserId: String(profile.id), githubLogin: profile.login }),
    },
  },
  user: {
    additionalFields: {
      githubUserId: { type: 'string', required: false, input: false },
      githubLogin: { type: 'string', required: false, input: false },
      isAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Invite-only: no user row is created unless the GitHub login is allowed.
        before: async (user) => {
          const adminIds = adminIdsFromEnv();
          const githubId = typeof user.githubUserId === 'string' ? user.githubUserId : '';
          const login = typeof user.githubLogin === 'string' ? user.githubLogin : '';
          const allowed = await isAllowedToSignUp(
            { githubId, login, email: user.email },
            { adminIds, isAllowlisted: allowlistLookup(db), e2eMode },
          );
          if (!allowed) return false;
          return { data: { ...user, githubLogin: login.toLowerCase() || null, isAdmin: adminIds.includes(githubId) } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
