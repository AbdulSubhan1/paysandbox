import { notFound } from 'next/navigation';
import { isE2eMode } from '@/lib/auth/allowlist';
import { getDb } from '@/lib/db/client';
import { jobHandlers } from '@/lib/jobs/handlers';
import { runDueJobs } from '@/lib/jobs/jobs';

/** E2E only (never on Vercel): runs due jobs as if the clock were `advanceSeconds` ahead, to test retries and timers. */
export async function POST(req: Request): Promise<Response> {
  if (!isE2eMode()) notFound();
  const { advanceSeconds } = (await req.json().catch(() => ({}))) as { advanceSeconds?: number };
  const now = new Date(Date.now() + (Number(advanceSeconds) || 0) * 1000);
  return Response.json({ ran: await runDueJobs(getDb(), now, jobHandlers, { limit: 200 }) });
}
