import { Client, Receiver } from '@upstash/qstash';
import { appUrl } from '@/lib/sessions/sessions';
import type { Scheduler } from './jobs';

const noop: Scheduler = { publish: async () => {} };

/** QStash when QSTASH_TOKEN is set; otherwise jobs run only after responses and from the daily cron. */
export function getScheduler(): Scheduler {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return noop;
  const client = new Client({ token });
  return {
    publish: async (job) => {
      await client.publishJSON({
        url: `${appUrl()}/api/internal/jobs`,
        body: { jobId: job.id },
        notBefore: Math.floor(job.runAt.getTime() / 1000),
        deduplicationId: job.id,
      });
    },
  };
}

export async function verifyQstashSignature(signature: string | null, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) return false;
  try {
    return await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body });
  } catch {
    return false;
  }
}
