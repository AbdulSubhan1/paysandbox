import { afterEach, describe, expect, it, vi } from 'vitest';
import { poolOptionsFromEnv } from './client';

afterEach(() => vi.unstubAllEnvs());

describe('poolOptionsFromEnv', () => {
  it('defaults to 5 connections kept 10 s', () => {
    vi.stubEnv('DB_POOL_MAX', '');
    vi.stubEnv('DB_POOL_IDLE_MS', '');
    expect(poolOptionsFromEnv()).toEqual({ max: 5, idleTimeoutMillis: 10_000 });
  });

  it('can be one short-lived connection (the local single-connection PGlite test database)', () => {
    vi.stubEnv('DB_POOL_MAX', '1');
    vi.stubEnv('DB_POOL_IDLE_MS', '50');
    expect(poolOptionsFromEnv()).toEqual({ max: 1, idleTimeoutMillis: 50 });
  });
});
