import { expireSessionJob } from '@/lib/sessions/expire';
import { deliverWebhookJob } from '@/lib/webhooks/deliver';
import type { JobHandler, JobHandlers } from './jobs';

// Replaced by the dispute handlers (Plan 2, Task 11).
const notYet: JobHandler = async () => ({ done: true });

export const jobHandlers: JobHandlers = {
  deliver_webhook: deliverWebhookJob,
  expire_session: expireSessionJob,
  open_dispute: notYet,
  dispute_deadline: notYet,
};
