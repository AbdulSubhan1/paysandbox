import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { Db } from '../src/lib/db/client';
import * as schema from '../src/lib/db/schema';
import { seedE2E } from '../src/test/seed-e2e';
import { E2E_DATABASE_URL } from './env';

export default async function globalSetup() {
  process.env.E2E_AUTH_BYPASS = '1';
  const pool = new Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });
  await seedE2E(db as unknown as Db);
  await pool.end();
}
