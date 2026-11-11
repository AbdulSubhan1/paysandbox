import { getDb } from '@/lib/db/client';
import { jobHandlers } from '@/lib/jobs/handlers';
import { publishPendingJobs, runJob } from '@/lib/jobs/jobs';
import { getScheduler, verifyQstashSignature } from '@/lib/jobs/scheduler';
import { reportError } from '@/lib/observability/report';

export const maxDuration = 60; // one webhook attempt can take 10 s; leave room for the database

/** QStash calls this at a job's run time. A 5xx makes QStash retry; the job's lease stops double runs. */
export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  if (!(await verifyQstashSignature(req.headers.get('upstash-signature'), body))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let jobId: unknown;
  try {
    ({ jobId } = JSON.parse(body));
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof jobId !== 'string') return Response.json({ error: 'job_id_missing' }, { status: 400 });
  const db = getDb();
  try {
    const result = await runJob(db, jobId, new Date(), jobHandlers);
    await publishPendingJobs(db, getScheduler(), new Date());
    return Response.json({ result });
  } catch (e) {
    reportError('jobs route', e);
    return Response.json({ error: 'job_failed' }, { status: 500 });
  }
}
