import { afterAll, vi } from 'vitest';
import { closeTestDbs } from './db';

// `after()` needs a Next.js request scope; unit tests run jobs directly instead.
vi.mock('@/lib/jobs/flush', () => ({ flushJobsAfterResponse: () => {} }));
// …and after-response work runs straight away, so tests can see its result.
vi.mock('@/lib/after', () => ({ runAfterResponse: (_where: string, task: () => Promise<unknown>) => void task() }));

afterAll(async () => {
  await closeTestDbs();
});
