import { ApiError } from '@/lib/api/errors';
import { validateEmail } from '@/lib/checkout/validate';
import type { LineItem } from '@/lib/db/schema';

export const AMOUNT_MIN = 100; // PKR 1.00
export const AMOUNT_MAX = 100_000_000; // PKR 1,000,000.00
export const MAX_LINE_ITEMS = 20;

export type CreateSessionInput = {
  amount: number;
  currency: 'pkr';
  lineItems: LineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail: string | null;
};

const invalid = (code: string, message: string, param?: string) => new ApiError(400, 'invalid_request_error', code, message, param);

function isLocalhost(url: URL) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function parseRedirectUrl(value: unknown, param: string): string {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw invalid('parameter_invalid', `${param} must be a full URL.`, param);
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost(url))) return url.toString();
  throw invalid('parameter_invalid', `${param} must use https (http is allowed only for localhost).`, param);
}

function isLineItem(v: unknown): v is LineItem {
  const i = v as LineItem;
  return (
    !!i &&
    typeof i.name === 'string' &&
    i.name.trim().length >= 1 &&
    i.name.length <= 200 &&
    Number.isInteger(i.quantity) &&
    i.quantity >= 1 &&
    i.quantity <= 1000 &&
    Number.isInteger(i.amount) &&
    i.amount >= 0
  );
}

/** Validates a create-session body. Throws ApiError(400) naming the first bad parameter. */
export function parseCreateSession(body: unknown): CreateSessionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('invalid_json', 'Send a JSON object with Content-Type: application/json.');
  }
  const b = body as Record<string, unknown>;
  for (const param of ['amount', 'currency', 'line_items', 'success_url', 'cancel_url']) {
    if (b[param] === undefined || b[param] === null) throw invalid('parameter_missing', `Missing required parameter: ${param}.`, param);
  }

  if (typeof b.amount !== 'number' || !Number.isInteger(b.amount)) {
    throw invalid('amount_not_integer', 'amount must be a whole number of paisa (e.g. 510000 for PKR 5,100.00).', 'amount');
  }
  if (b.amount < AMOUNT_MIN) throw invalid('amount_too_small', 'amount must be at least 100 paisa (PKR 1.00).', 'amount');
  if (b.amount > AMOUNT_MAX) throw invalid('amount_too_large', 'amount must be at most 100000000 paisa (PKR 1,000,000.00).', 'amount');

  if (typeof b.currency !== 'string' || b.currency.toLowerCase() !== 'pkr') {
    throw invalid('currency_not_supported', 'Only pkr is supported.', 'currency');
  }

  const items = b.line_items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINE_ITEMS || !items.every(isLineItem)) {
    throw invalid(
      'parameter_invalid',
      `line_items must be 1 to ${MAX_LINE_ITEMS} items of { name (1-200 chars), quantity (1-1000), amount (paisa) }.`,
      'line_items',
    );
  }

  const successUrl = parseRedirectUrl(b.success_url, 'success_url');
  const cancelUrl = parseRedirectUrl(b.cancel_url, 'cancel_url');

  let customerEmail: string | null = null;
  if (b.customer_email !== undefined && b.customer_email !== null) {
    if (typeof b.customer_email !== 'string' || validateEmail(b.customer_email)) {
      throw invalid('parameter_invalid', 'customer_email must be a valid email.', 'customer_email');
    }
    customerEmail = b.customer_email.trim().toLowerCase();
  }

  return {
    amount: b.amount,
    currency: 'pkr',
    lineItems: items.map((i: LineItem) => ({ name: i.name.trim(), quantity: i.quantity, amount: i.amount })),
    successUrl,
    cancelUrl,
    customerEmail,
  };
}
