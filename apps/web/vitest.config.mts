import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // Each DB test boots an in-memory Postgres (PGlite) and runs migrations; that is slow under parallel load.
    hookTimeout: 30_000,
    maxWorkers: 3, // each worker holds PGlite instances; more workers ran the machine out of memory
    testTimeout: 30_000,
    env: { WEBHOOK_SECRET_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, // 32 zero bytes: tests only
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      thresholds: {
        'src/lib/card-guard/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['./src/test/setup-node.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.dom.test.tsx'],
          setupFiles: ['./src/test/setup-dom.ts'],
        },
      },
    ],
  },
});
