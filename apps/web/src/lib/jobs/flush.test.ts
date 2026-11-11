import { describe, expect, it, vi } from 'vitest';

vi.unmock('@/lib/jobs/flush'); // setup-node mocks it for every other test
let scheduled: (() => Promise<void>) | null = null;
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => void (scheduled = fn) }));
const runDueJobs = vi.fn(async () => 0);
const publishPendingJobs = vi.fn(async () => 0);
vi.mock('./jobs', () => ({ runDueJobs, publishPendingJobs }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('./scheduler', () => ({ getScheduler: () => ({ publish: async () => {} }) }));

const { flushJobsAfterResponse, FLUSH_JOB_LIMIT } = await import('./flush');

describe('flushJobsAfterResponse', () => {
  it('runs only a few due jobs inline, then publishes the rest', async () => {
    flushJobsAfterResponse({ merchantId: 'mer_1' });
    await scheduled!();
    expect(FLUSH_JOB_LIMIT).toBe(5);
    expect(runDueJobs).toHaveBeenCalledWith({}, expect.any(Date), expect.anything(), { merchantId: 'mer_1', limit: 5 });
    expect(publishPendingJobs).toHaveBeenCalledTimes(1);
  });
});
