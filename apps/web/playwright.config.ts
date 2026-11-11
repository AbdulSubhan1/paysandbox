import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_PORT, E2E_WEBHOOK_SECRET_KEY } from './e2e/env';

// The test process also writes endpoint secrets (e2e/helpers.ts), so it needs the same key as the app.
process.env.WEBHOOK_SECRET_KEY ??= E2E_WEBHOOK_SECRET_KEY;

const ci = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  workers: 2,
  retries: ci ? 1 : 0,
  // Local runs use `next dev`, which compiles each route on first visit; give assertions room for that.
  expect: { timeout: 15_000 },
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: E2E_BASE_URL, trace: 'retain-on-failure' },
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    ...(ci
      ? []
      : [
          {
            command: 'rm -rf .pglite-e2e && PGLITE_DIR=.pglite-e2e PGLITE_PORT=5434 node scripts/local-db.mjs',
            port: 5434,
            reuseExistingServer: false,
          },
        ]),
    {
      command: ci ? `pnpm exec next start -p ${E2E_PORT}` : `pnpm exec next dev -p ${E2E_PORT}`,
      url: `${E2E_BASE_URL}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        E2E_AUTH_BYPASS: '1',
        APP_URL: E2E_BASE_URL,
        BETTER_AUTH_URL: E2E_BASE_URL,
        BETTER_AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0000',
        WEBHOOK_SECRET_KEY: E2E_WEBHOOK_SECRET_KEY,
      },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@smoke/ },
  ],
});
