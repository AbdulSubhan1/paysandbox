import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/** Works for both the `pg` driver (app, E2E) and PGlite (Vitest), and for transactions. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

/**
 * Pool size and idle time, from the environment. Defaults suit Neon / Postgres. The local PGlite test database
 * takes one connection at a time, so local E2E sets DB_POOL_MAX=1 and a short DB_POOL_IDLE_MS (playwright.config.ts).
 */
export function poolOptionsFromEnv(): { max: number; idleTimeoutMillis: number } {
  return { max: Number(process.env.DB_POOL_MAX || 5), idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 10_000) };
}

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    db = drizzle({ client: new Pool({ connectionString: url, ...poolOptionsFromEnv() }), schema, casing: 'snake_case' }) as unknown as Db;
  }
  return db;
}

/** Tests swap in a PGlite database. */
export function setDbForTests(test: Db): void {
  db = test;
}
