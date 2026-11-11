import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { type Db, setDbForTests } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

// Migrate once per test worker, then clone that database for each test (much faster than migrating every time).
let template: Promise<PGlite> | undefined;

function migratedTemplate(): Promise<PGlite> {
  template ??= (async () => {
    const client = new PGlite();
    await migrate(drizzle({ client, casing: 'snake_case' }), { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    return client;
  })();
  return template;
}

/** A fresh in-memory Postgres with all migrations applied, also installed as the app's db. */
export async function createTestDb(): Promise<Db> {
  const client = (await (await migratedTemplate()).clone()) as PGlite;
  const db = drizzle({ client, schema, casing: 'snake_case' }) as unknown as Db;
  setDbForTests(db);
  return db;
}
