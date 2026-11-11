// A local Postgres for development and E2E without Docker: PGlite behind the Postgres wire protocol.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = process.env.PGLITE_DIR ?? '.pglite-local';
const port = Number(process.env.PGLITE_PORT ?? 5433);

const db = await PGlite.create(dataDir);
// PGlite is one database: clients connected at the same time can interleave multi-step (extended protocol)
// queries and fail with 'portal "" does not exist'. The app keeps each pool to one connection locally
// (DB_POOL_MAX=1) so that only separate dev-mode module copies can overlap. maxConnections 1 refuses extras instead.
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`PGlite ready: postgres://postgres:postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
