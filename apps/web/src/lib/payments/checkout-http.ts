import { getDb } from '@/lib/db/client';
import { PayError, type PayErrorCode, type PayResult } from './pay';

const STATUS: Record<PayErrorCode | 'cvc_not_accepted' | 'internal_error', number> = {
  card_not_test_card: 400,
  invalid_field: 400,
  cvc_not_accepted: 400,
  session_not_found: 404,
  session_complete: 409,
  payment_in_progress: 409,
  session_expired: 410,
  internal_error: 500,
};

const NO_STORE = { 'Cache-Control': 'no-store' };

export function checkoutError(code: keyof typeof STATUS, message: string, field?: string): Response {
  return Response.json({ error: { code, message, ...(field ? { field } : {}) } }, { status: STATUS[code], headers: NO_STORE });
}

function toJson(r: PayResult) {
  return {
    status: r.status,
    payment_id: r.paymentId,
    ...(r.failure ? { failure: { code: r.failure.code, decline_code: r.failure.declineCode, message: r.failure.message } } : {}),
    ...(r.returnUrl ? { return_url: r.returnUrl } : {}),
    ...(r.attemptsLeft !== undefined ? { attempts_left: r.attemptsLeft } : {}),
  };
}

/**
 * Shared shell for the checkout's browser-facing routes. Never logs the request body (it can hold a card number);
 * unexpected errors are reported by name only.
 */
export async function handleCheckoutPost(
  req: Request,
  run: (body: Record<string, unknown>, db: ReturnType<typeof getDb>) => Promise<PayResult>,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return checkoutError('invalid_field', 'Send a JSON object.');
  }
  try {
    return Response.json(toJson(await run(body, getDb())), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof PayError) return checkoutError(e.code, e.message, e.field);
    return checkoutError('internal_error', 'Something went wrong on our side. Try again.');
  }
}

/** Reads required string fields; throws PayError naming the first missing one. */
export function strings<K extends string>(body: Record<string, unknown>, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) {
    const v = body[k];
    if (typeof v !== 'string' || v.length === 0 || v.length > 200) throw new PayError('invalid_field', `Missing or invalid ${k}.`, k);
    out[k] = v;
  }
  return out;
}
