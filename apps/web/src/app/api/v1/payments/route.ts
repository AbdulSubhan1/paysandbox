import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { listPayments } from '@/lib/payments/read';

export const GET = withApi(async (ctx, req) => {
  const params = new URL(req.url).searchParams;
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? 10 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(400, 'invalid_request_error', 'parameter_invalid', 'limit must be a whole number from 1 to 100.', 'limit');
  }
  return { status: 200, body: await listPayments(ctx.db, ctx.merchantId, { limit, startingAfter: params.get('starting_after') }) };
});
