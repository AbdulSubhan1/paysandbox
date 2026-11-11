import { getDb } from '@/lib/db/client';
import { jobHandlers } from '@/lib/jobs/handlers';
import { publishPendingJobs, runDueJobs } from '@/lib/jobs/jobs';
import { getScheduler } from '@/lib/jobs/scheduler';

export const maxDuration = 60;

/** Daily Vercel cron (vercel.json): a safety net that runs anything QStash missed. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const db = getDb();
  const ran = await runDueJobs(db, new Date(), jobHandlers, { limit: 200 });
  const published = await publishPendingJobs(db, getScheduler(), new Date());
  return Response.json({ ran, published });
}
