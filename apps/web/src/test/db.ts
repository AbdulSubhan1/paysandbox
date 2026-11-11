import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { type Db, setDbForTests } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';

/** A fresh in-memory Postgres with all migrations applied, also installed as the app's db. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  setDbForTests(db as unknown as Db);
  return db as unknown as Db;
}
