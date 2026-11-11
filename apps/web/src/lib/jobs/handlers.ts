import { disputeDeadlineJob, openDisputeJob } from '@/lib/disputes/disputes';
import { expireSessionJob } from '@/lib/sessions/expire';
import { deliverWebhookJob } from '@/lib/webhooks/deliver';
import type { JobHandlers } from './jobs';

export const jobHandlers: JobHandlers = {
  deliver_webhook: deliverWebhookJob,
  expire_session: expireSessionJob,
  open_dispute: openDisputeJob,
  dispute_deadline: disputeDeadlineJob,
};
