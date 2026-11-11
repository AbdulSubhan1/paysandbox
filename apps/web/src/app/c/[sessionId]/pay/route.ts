import { checkoutError, handleCheckoutPost, strings } from '@/lib/payments/checkout-http';
import { payCheckoutSession } from '@/lib/payments/pay';

// A short pause so the customer sees "Processing…", like a real gateway. Skipped in tests.
const PROCESSING_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 800;

export async function POST(req: Request, ctx: RouteContext<'/c/[sessionId]/pay'>) {
  const { sessionId } = await ctx.params;
  const raw: unknown = await req.clone().json().catch(() => null);
  if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'cvc')) {
    return checkoutError('cvc_not_accepted', 'The CVC is checked in your browser and must never be sent.');
  }
  return handleCheckoutPost(req, async (body, db) => {
    const f = strings(body, ['attempt_id', 'email', 'name', 'card_number', 'expiry'] as const);
    await new Promise((r) => setTimeout(r, PROCESSING_DELAY_MS));
    return payCheckoutSession(
      db,
      { sessionId, attemptId: f.attempt_id, email: f.email, name: f.name, cardNumber: f.card_number, expiry: f.expiry },
      new Date(),
    );
  });
}
