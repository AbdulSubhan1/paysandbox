import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
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
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts'] },
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
