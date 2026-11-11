import { handleCheckoutPost, strings } from '@/lib/payments/checkout-http';
import { submitOtp } from '@/lib/payments/otp';

export async function POST(req: Request, ctx: RouteContext<'/c/[sessionId]/otp'>) {
  const { sessionId } = await ctx.params;
  return handleCheckoutPost(req, async (body, db) => {
    const { payment_id: paymentId } = strings(body, ['payment_id'] as const);
    if (body.cancel === true) return submitOtp(db, { sessionId, paymentId, cancel: true }, new Date());
    const { code } = strings(body, ['code'] as const);
    return submitOtp(db, { sessionId, paymentId, code }, new Date());
  });
}
