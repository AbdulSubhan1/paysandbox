import { ApiError } from '@/lib/api/errors';
import { withApi } from '@/lib/api/handler';
import { parseCreateSession } from '@/lib/sessions/input';
import { createCheckoutSession, toSessionObject } from '@/lib/sessions/sessions';

export const POST = withApi(
  async (ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, 'invalid_request_error', 'invalid_json', 'Send a JSON object with Content-Type: application/json.');
    }
    const row = await createCheckoutSession(ctx, parseCreateSession(body));
    return { status: 200, body: toSessionObject(row, ctx.now) };
  },
  { idempotent: true },
);
