import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { getCheckoutSession, toSessionObject } from '@/lib/sessions/sessions';

export const GET = withApi(async (ctx, _req, params) => {
  const row = await getCheckoutSession(ctx.db, ctx.merchantId, params.id);
  if (!row) throw new ApiError(404, 'invalid_request_error', 'resource_missing', `No such checkout session: ${params.id}`, 'id');
  return { status: 200, body: toSessionObject(row, ctx.now) };
});
