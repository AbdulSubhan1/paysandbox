import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { getDb } from '@/lib/db/client';
import { checkoutSessions } from '@/lib/db/schema';
import { reportError } from '@/lib/observability/report';
import { jobHandlers } from './handlers';
import { publishPendingJobs, runDueJobs } from './jobs';
import { getScheduler } from './scheduler';

/** Each inline webhook attempt can take 10 s; more than a few would outlast the route's time limit. */
export const FLUSH_JOB_LIMIT = 5;

/**
 * After the response is sent: run this merchant's due jobs (so the first webhook attempt needs no QStash message),
 * then hand future jobs to QStash. Mocked out in unit tests, which drive jobs directly.
 */
export function flushJobsAfterResponse(scope: { merchantId: string } | { sessionId: string }): void {
  after(async () => {
    try {
      const db = getDb();
      let merchantId = 'merchantId' in scope ? scope.merchantId : null;
      if (!merchantId && 'sessionId' in scope) {
        const [s] = await db.select({ merchantId: checkoutSessions.merchantId }).from(checkoutSessions).where(eq(checkoutSessions.id, scope.sessionId));
        merchantId = s?.merchantId ?? null;
      }
      if (merchantId) await runDueJobs(db, new Date(), jobHandlers, { merchantId, limit: FLUSH_JOB_LIMIT });
      await publishPendingJobs(db, getScheduler(), new Date());
    } catch (e) {
      reportError('jobs flush', e);
    }
  });
}
