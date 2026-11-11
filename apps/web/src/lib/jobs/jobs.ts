import { and, asc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/client';
import { jobs } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { reportError } from '@/lib/observability/report';

export type JobKind = (typeof jobs.$inferSelect)['kind'];
export type JobRow = typeof jobs.$inferSelect;
export type JobOutcome = { done: true } | { retryAt: Date };
export type JobHandler = (db: Db, job: JobRow, now: Date) => Promise<JobOutcome>;
export type JobHandlers = Record<JobKind, JobHandler>;
export type Scheduler = { publish(job: { id: string; runAt: Date }): Promise<void> };

/** A running job holds this lease; if its runner dies, the job becomes runnable again when the lease ends. */
export const JOB_LEASE_SECONDS = 60;

/** Inserts only, so it can share the transaction of the change that needs the job (transactional outbox). */
export async function enqueueJob(db: Db, j: { merchantId: string; kind: JobKind; refId: string; runAt: Date; now: Date }): Promise<string> {
  const id = newId('job');
  await db.insert(jobs).values({ id, merchantId: j.merchantId, kind: j.kind, refId: j.refId, runAt: j.runAt, createdAt: j.now });
  return id;
}

const runnable = (now: Date) =>
  and(eq(jobs.state, 'pending'), lte(jobs.runAt, now), or(isNull(jobs.lockedUntil), lt(jobs.lockedUntil, now)));

/** Claims the job with a lease (one runner wins), runs its handler and records the outcome. */
export async function runJob(db: Db, jobId: string, now: Date, handlers: JobHandlers): Promise<'ran' | 'skipped'> {
  const [job] = await db
    .update(jobs)
    .set({ lockedUntil: new Date(now.getTime() + JOB_LEASE_SECONDS * 1000), attempts: sql`${jobs.attempts} + 1` })
    .where(and(eq(jobs.id, jobId), runnable(now)))
    .returning();
  if (!job) return 'skipped';

  let outcome: JobOutcome;
  try {
    outcome = await handlers[job.kind](db, job, now);
  } catch (e) {
    // The lease stays, so the job is retried after it ends (by QStash's retry or the daily cron).
    await db.update(jobs).set({ lastError: e instanceof Error ? e.name : typeof e }).where(eq(jobs.id, job.id));
    throw e;
  }
  await db
    .update(jobs)
    .set('retryAt' in outcome ? { runAt: outcome.retryAt, publishedAt: null, lockedUntil: null } : { state: 'done', lockedUntil: null })
    .where(eq(jobs.id, job.id));
  return 'ran';
}

/** Runs due jobs oldest first. One failing job is reported and does not stop the others. */
export async function runDueJobs(
  db: Db,
  now: Date,
  handlers: JobHandlers,
  filter: { merchantId?: string; limit?: number } = {},
): Promise<number> {
  const due = await db
    .select({ id: jobs.id, kind: jobs.kind })
    .from(jobs)
    .where(and(runnable(now), filter.merchantId ? eq(jobs.merchantId, filter.merchantId) : undefined))
    .orderBy(asc(jobs.runAt))
    .limit(filter.limit ?? 50);
  let ran = 0;
  for (const j of due) {
    try {
      if ((await runJob(db, j.id, now, handlers)) === 'ran') ran++;
    } catch (e) {
      reportError(`job ${j.kind}`, e);
    }
  }
  return ran;
}

/**
 * Hands every unpublished pending job to the scheduler (QStash). Due ones are included: a job run by QStash can create
 * a follow-up that is due at once, and QStash then calls straight back. A failed publish leaves the job for the daily cron.
 */
export async function publishPendingJobs(db: Db, scheduler: Scheduler, now: Date): Promise<number> {
  const pending = await db
    .select({ id: jobs.id, runAt: jobs.runAt })
    .from(jobs)
    .where(and(eq(jobs.state, 'pending'), isNull(jobs.publishedAt)))
    .orderBy(asc(jobs.runAt))
    .limit(100);
  let published = 0;
  for (const j of pending) {
    try {
      await scheduler.publish(j);
      await db.update(jobs).set({ publishedAt: now }).where(eq(jobs.id, j.id));
      published++;
    } catch (e) {
      reportError('jobs publish', e);
    }
  }
  return published;
}
