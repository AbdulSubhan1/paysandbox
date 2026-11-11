import { afterAll, vi } from 'vitest';
import { closeTestDbs } from './db';

// `after()` needs a Next.js request scope; unit tests run jobs directly instead.
vi.mock('@/lib/jobs/flush', () => ({ flushJobsAfterResponse: () => {} }));

afterAll(async () => {
  await closeTestDbs();
});
