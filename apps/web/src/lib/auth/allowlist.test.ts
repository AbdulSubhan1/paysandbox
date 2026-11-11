import { describe, expect, it } from 'vitest';
import { isAllowedToSignUp } from './allowlist';

const deps = (list: string[], e2eMode = false) => ({
  adminIds: ['1001'],
  isAllowlisted: async (login: string) => list.includes(login.toLowerCase()),
  e2eMode,
});

describe('isAllowedToSignUp (PS-AUTH-012/013)', () => {
  it('always lets the admin in', async () => {
    expect(await isAllowedToSignUp({ githubId: '1001', login: 'AbdulSubhan1' }, deps([]))).toBe(true);
  });

  it('refuses a GitHub user who is not on the allowlist', async () => {
    expect(await isAllowedToSignUp({ githubId: '2', login: 'stranger' }, deps([]))).toBe(false);
  });

  it('lets an allowlisted login in, ignoring case', async () => {
    expect(await isAllowedToSignUp({ githubId: '3', login: 'friend' }, deps(['friend']))).toBe(true);
    expect(await isAllowedToSignUp({ githubId: '3', login: 'Friend' }, deps(['friend']))).toBe(true);
  });

  it('accepts @e2e.test emails only in E2E mode', async () => {
    const profile = { githubId: '', login: '', email: 'qa@e2e.test' };
    expect(await isAllowedToSignUp(profile, deps([], false))).toBe(false);
    expect(await isAllowedToSignUp(profile, deps([], true))).toBe(true);
  });
});
