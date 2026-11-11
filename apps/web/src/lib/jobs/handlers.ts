import { deliverWebhookJob } from '@/lib/webhooks/deliver';
import type { JobHandler, JobHandlers } from './jobs';

// Replaced by the session-expiry and dispute handlers (Plan 2, Tasks 9 and 11).
const notYet: JobHandler = async () => ({ done: true });

export const jobHandlers: JobHandlers = {
  deliver_webhook: deliverWebhookJob,
  expire_session: notYet,
  open_dispute: notYet,
  dispute_deadline: notYet,
};
