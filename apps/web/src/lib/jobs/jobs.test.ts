import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { jobs } from '@/lib/db/schema';
import { createTestDb } from '@/test/db';
import { makeMerchant } from '@/test/factories';
import { enqueueJob, type JobHandler, type JobHandlers, publishPendingJobs, runDueJobs, runJob, type Scheduler } from './jobs';

const now = new Date('2026-11-11T10:00:00Z');
const plus = (s: number) => new Date(now.getTime() + s * 1000);
const done: JobHandler = async () => ({ done: true });
const handlersWith = (h: Partial<JobHandlers>): JobHandlers => ({
  deliver_webhook: done,
  expire_session: done,
  open_dispute: done,
  dispute_deadline: done,
  ...h,
});
const job = async (id: string) => (await db.select().from(jobs).where(eq(jobs.id, id)))[0];

let db: Db;
let merchantId: string;
beforeEach(async () => {
  db = await createTestDb();
  merchantId = (await makeMerchant(db)).id;
});

describe('jobs outbox', () => {
  it('runs a due job once even when two runners race for it (Review Focus 2)', async () => {
    const calls: string[] = [];
    const handlers = handlersWith({ deliver_webhook: async (_db, j) => (calls.push(j.refId), { done: true }) });
    const id = await enqueueJob(db, { merchantId, kind: 'deliver_webhook', refId: 'dlv_1', runAt: now, now });
    const results = await Promise.all([runJob(db, id, now, handlers), runJob(db, id, now, handlers)]);
    expect(results.sort()).toEqual(['ran', 'skipped']);
    expect(calls).toEqual(['dlv_1']);
    expect(await job(id)).toMatchObject({ state: 'done', attempts: 1 });
    expect(await runJob(db, id, plus(120), handlers)).toBe('skipped');
  });

  it('skips a job that is not due yet', async () => {
    const id = await enqueueJob(db, { merchantId, kind: 'expire_session', refId: 'cs_1', runAt: plus(60), now });
    expect(await runJob(db, id, now, handlersWith({}))).toBe('skipped');
    expect(await runJob(db, id, plus(60), handlersWith({}))).toBe('ran');
  });

  it('re-arms a job that asks to retry, and unpublishes it', async () => {
    const id = await enqueueJob(db, { merchantId, kind: 'deliver_webhook', refId: 'dlv_1', runAt: now, now });
    await db.update(jobs).set({ publishedAt: now }).where(eq(jobs.id, id));
    await runJob(db, id, now, handlersWith({ deliver_webhook: async () => ({ retryAt: plus(60) }) }));
    expect(await job(id)).toMatchObject({ state: 'pending', runAt: plus(60), publishedAt: null, lockedUntil: null });
  });

  it('holds a crashed job for the 60 s lease, then lets it run again', async () => {
    const id = await enqueueJob(db, { merchantId, kind: 'open_dispute', refId: 'pay_1', runAt: now, now });
    const boom = handlersWith({ open_dispute: async () => { throw new TypeError('db down'); } });
    await expect(runJob(db, id, now, boom)).rejects.toThrow('db down');
    expect(await job(id)).toMatchObject({ state: 'pending', lastError: 'TypeError' });
    expect(await runJob(db, id, plus(30), handlersWith({}))).toBe('skipped');
    expect(await runJob(db, id, plus(61), handlersWith({}))).toBe('ran');
  });

  it('runs due jobs oldest first, optionally for one merchant', async () => {
    const other = (await makeMerchant(db)).id;
    const order: string[] = [];
    const handlers = handlersWith({ expire_session: async (_db, j) => (order.push(j.refId), { done: true }) });
    await enqueueJob(db, { merchantId, kind: 'expire_session', refId: 'b', runAt: plus(-10), now });
    await enqueueJob(db, { merchantId, kind: 'expire_session', refId: 'a', runAt: plus(-20), now });
    await enqueueJob(db, { merchantId: other, kind: 'expire_session', refId: 'other', runAt: plus(-30), now });
    await enqueueJob(db, { merchantId, kind: 'expire_session', refId: 'future', runAt: plus(60), now });
    expect(await runDueJobs(db, now, handlers, { merchantId })).toBe(2);
    expect(order).toEqual(['a', 'b']);
    expect(await runDueJobs(db, now, handlers)).toBe(1);
    expect(order).toEqual(['a', 'b', 'other']);
  });

  it('publishes every unpublished pending job once, due ones included', async () => {
    // A job run by QStash can create a follow-up that is due at once (e.g. the dispute.created delivery after the
    // 0259 dispute opens). Publishing it lets QStash call straight back instead of waiting for the daily cron.
    const published: string[] = [];
    const scheduler: Scheduler = { publish: async (j) => void published.push(j.id) };
    const due = await enqueueJob(db, { merchantId, kind: 'deliver_webhook', refId: 'dlv_1', runAt: now, now });
    const future = await enqueueJob(db, { merchantId, kind: 'dispute_deadline', refId: 'dp_1', runAt: plus(3600), now });
    const finished = await enqueueJob(db, { merchantId, kind: 'deliver_webhook', refId: 'dlv_2', runAt: now, now });
    await runJob(db, finished, now, handlersWith({}));
    expect(await publishPendingJobs(db, scheduler, now)).toBe(2);
    expect(published.sort()).toEqual([due, future].sort());
    expect(await publishPendingJobs(db, scheduler, now)).toBe(0);
    expect((await job(future)).publishedAt).toEqual(now);
  });

  it('leaves a job unpublished when publishing fails', async () => {
    const id = await enqueueJob(db, { merchantId, kind: 'dispute_deadline', refId: 'dp_1', runAt: plus(3600), now });
    const failing: Scheduler = { publish: async () => { throw new Error('qstash down'); } };
    expect(await publishPendingJobs(db, failing, now)).toBe(0);
    expect((await job(id)).publishedAt).toBeNull();
  });
});
