import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Db, setDbForTests } from '@/lib/db/client';
import { jobs, webhookAttempts } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs/jobs';
import { createTestDb } from '@/test/db';
import { makeEndpoint, makeMerchant, makePayment } from '@/test/factories';

const verifyQstashSignature = vi.fn(async (sig: string | null) => sig === 'good');
vi.mock('@/lib/jobs/scheduler', () => ({ verifyQstashSignature, getScheduler: () => ({ publish: async () => {} }) }));

const { POST: jobsRoute } = await import('./jobs/route');
const { GET: cronRoute } = await import('./cron/route');
const { POST: runJobsRoute } = await import('./e2e/run-jobs/route');

let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  merchantId = (await makeMerchant(db)).id;
});
afterEach(() => vi.unstubAllEnvs());

const state = async (id: string) => (await db.select().from(jobs).where(eq(jobs.id, id)))[0].state;
const dueJob = (runAt = new Date()) => enqueueJob(db, { merchantId, kind: 'expire_session', refId: 'cs_test_missing', runAt, now: new Date() });

describe('POST /api/internal/jobs (QStash)', () => {
  const call = (body: object, signature?: string) =>
    jobsRoute(
      new Request('http://localhost/api/internal/jobs', {
        method: 'POST',
        headers: signature ? { 'upstash-signature': signature } : {},
        body: JSON.stringify(body),
      }),
    );

  it('refuses a missing or wrong signature', async () => {
    const id = await dueJob();
    expect((await call({ jobId: id })).status).toBe(401);
    expect((await call({ jobId: id }, 'bad')).status).toBe(401);
    expect(await state(id)).toBe('pending');
  });

  it('runs the job when the signature is valid', async () => {
    const id = await dueJob();
    const res = await call({ jobId: id }, 'good');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'ran' });
    expect(await state(id)).toBe('done');
  });
});

describe('GET /api/internal/cron', () => {
  const call = (auth?: string) => cronRoute(new Request('http://localhost/api/internal/cron', { headers: auth ? { authorization: auth } : {} }));

  it('needs the CRON_SECRET bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
  });

  it('runs overdue jobs', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const id = await dueJob(new Date(Date.now() - 3600_000));
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await state(id)).toBe('done');
  });
});

describe('POST /api/internal/e2e/run-jobs', () => {
  const call = (advanceSeconds: number) =>
    runJobsRoute(new Request('http://localhost/api/internal/e2e/run-jobs', { method: 'POST', body: JSON.stringify({ advanceSeconds }) }));

  it('does not exist outside E2E mode', async () => {
    vi.stubEnv('E2E_AUTH_BYPASS', '');
    await expect(call(0)).rejects.toThrow(); // notFound()
  });

  it('keeps running until follow-up jobs created on the way are done, like QStash calling back', async () => {
    vi.stubEnv('E2E_AUTH_BYPASS', '1');
    vi.stubEnv('VERCEL', '');
    await makeEndpoint(db, merchantId, { url: 'http://127.0.0.1:1/hook' }); // closed port: the attempt fails fast
    const pay = await makePayment(db, merchantId, { testCard: 'dispute' });
    await enqueueJob(db, { merchantId, kind: 'open_dispute', refId: pay.id, runAt: new Date(Date.now() + 60_000), now: new Date() });
    const res = await call(61);
    expect((await res.json()).ran).toBe(2); // the dispute, then its dispute.created delivery
    expect(await db.select().from(webhookAttempts)).toHaveLength(1);
  });

  it('runs jobs as if the clock were ahead', async () => {
    vi.stubEnv('E2E_AUTH_BYPASS', '1');
    vi.stubEnv('VERCEL', '');
    const id = await dueJob(new Date(Date.now() + 60_000));
    const res = await call(61);
    expect(await res.json()).toEqual({ ran: 1 });
    expect(await state(id)).toBe('done');
  });
});
