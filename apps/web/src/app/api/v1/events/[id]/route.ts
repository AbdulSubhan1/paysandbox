import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { toEventObject } from '@/lib/events/objects';
import { getEvent } from '@/lib/events/record';

export const GET = withApi(async (ctx, _req, params) => {
  const event = await getEvent(ctx.db, ctx.merchantId, params.id);
  if (!event) throw new ApiError(404, 'invalid_request_error', 'resource_missing', `No such event: ${params.id}`, 'id');
  return { status: 200, body: toEventObject(event) };
});
