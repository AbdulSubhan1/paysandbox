import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/** Works for both the `pg` driver (app, E2E) and PGlite (Vitest), and for transactions. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    db = drizzle({ client: new Pool({ connectionString: url, max: 5 }), schema, casing: 'snake_case' }) as unknown as Db;
  }
  return db;
}

/** Tests swap in a PGlite database. */
export function setDbForTests(test: Db): void {
  db = test;
}
