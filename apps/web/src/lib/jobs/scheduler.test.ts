import { afterEach, describe, expect, it, vi } from 'vitest';

const publishJSON = vi.fn(async () => ({ messageId: 'm1' }));
const verify = vi.fn(async () => true);
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(function () { return { publishJSON }; }),
  Receiver: vi.fn(function () { return { verify }; }),
}));

const { getScheduler, verifyQstashSignature } = await import('./scheduler');

afterEach(() => {
  vi.unstubAllEnvs();
  publishJSON.mockClear();
});

describe('scheduler', () => {
  it('publishes { jobId } to the jobs route with notBefore in seconds', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'token');
    vi.stubEnv('APP_URL', 'https://paysandbox.vercel.app');
    await getScheduler().publish({ id: 'job_1', runAt: new Date('2026-11-11T10:00:00Z') });
    expect(publishJSON).toHaveBeenCalledWith({
      url: 'https://paysandbox.vercel.app/api/internal/jobs',
      body: { jobId: 'job_1' },
      notBefore: Date.UTC(2026, 10, 11, 10) / 1000,
      deduplicationId: `job_1-${Date.UTC(2026, 10, 11, 10)}`,
    });
  });

  it('gives a re-armed job a new deduplication id, so QStash does not drop the retry', async () => {
    // QStash keeps deduplication ids for 90 days and silently drops repeats: a retry must not reuse the first id.
    vi.stubEnv('QSTASH_TOKEN', 'token');
    const s = getScheduler();
    await s.publish({ id: 'job_1', runAt: new Date('2026-11-11T10:01:00Z') });
    await s.publish({ id: 'job_1', runAt: new Date('2026-11-11T10:06:00Z') });
    const ids = (publishJSON.mock.calls as unknown as [{ deduplicationId: string }][]).map(([c]) => c.deduplicationId);
    expect(new Set(ids).size).toBe(2);
    await s.publish({ id: 'job_1', runAt: new Date('2026-11-11T10:06:00Z') }); // same run time from two publishers: still deduped
    expect((publishJSON.mock.calls as unknown as [{ deduplicationId: string }][]).at(-1)![0].deduplicationId).toBe(ids[1]);
  });

  it('does nothing without QSTASH_TOKEN', async () => {
    vi.stubEnv('QSTASH_TOKEN', '');
    await getScheduler().publish({ id: 'job_1', runAt: new Date() });
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it('refuses a request with no signature or no signing keys', async () => {
    expect(await verifyQstashSignature(null, '{}')).toBe(false);
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '');
    expect(await verifyQstashSignature('sig', '{}')).toBe(false);
    vi.stubEnv('APP_URL', 'https://paysandbox.vercel.app');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'k1');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'k2');
    expect(await verifyQstashSignature('sig', '{"jobId":"job_1"}')).toBe(true);
    expect(verify).toHaveBeenCalledWith({ signature: 'sig', body: '{"jobId":"job_1"}', url: 'https://paysandbox.vercel.app/api/internal/jobs' });
    verify.mockRejectedValueOnce(new Error('bad signature'));
    expect(await verifyQstashSignature('sig', '{}')).toBe(false);
  });
});
