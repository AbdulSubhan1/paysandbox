import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { flushJobsAfterResponse } from '@/lib/jobs/flush';
import { parseCreateRefund } from '@/lib/refunds/input';
import { createRefund, toRefundObject } from '@/lib/refunds/refunds';

export const POST = withApi(
  async (ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, 'invalid_request_error', 'invalid_json', 'Send a JSON object with Content-Type: application/json.');
    }
    const input = parseCreateRefund(body);
    const { refund } = await createRefund(ctx.db, { merchantId: ctx.merchantId, paymentId: input.payment, amount: input.amount, reason: input.reason, now: ctx.now });
    flushJobsAfterResponse({ merchantId: ctx.merchantId }); // sends refund.created
    return { status: 200, body: toRefundObject(refund) };
  },
  { idempotent: true },
);
