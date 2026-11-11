export const E2E_PORT = 3090;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
/** CI provides a Postgres service; locally a throwaway PGlite server on 5434. */
export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E ?? 'postgres://postgres:postgres@127.0.0.1:5434/postgres';
