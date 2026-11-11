import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { getPayment } from '@/lib/payments/read';

export const GET = withApi(async (ctx, _req, params) => {
  const payment = await getPayment(ctx.db, ctx.merchantId, params.id);
  if (!payment) throw new ApiError(404, 'invalid_request_error', 'resource_missing', `No such payment: ${params.id}`, 'id');
  return { status: 200, body: payment };
});
