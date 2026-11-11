import { ApiError } from '@/lib/api/errors';
import { validateEmail } from '@/lib/checkout/validate';
import { CURRENCIES, CURRENCY_INFO, type Currency, parseCurrency } from '@/lib/currency';
import type { LineItem } from '@/lib/db/schema';
import { formatMoney } from '@/lib/money';

export const AMOUNT_MIN = 100; // 1.00 in every currency; the maximum is per currency (CURRENCY_INFO)
export const MAX_LINE_ITEMS = 20;

export type CreateSessionInput = {
  amount: number;
  currency: Currency;
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

/**
 * Validates a create-session body for a project charging in `projectCurrency`. `currency` may be left out; if sent it
 * must be the project's. Throws ApiError(400) naming the first bad parameter.
 */
export function parseCreateSession(body: unknown, projectCurrency: Currency): CreateSessionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('invalid_json', 'Send a JSON object with Content-Type: application/json.');
  }
  const b = body as Record<string, unknown>;
  for (const param of ['amount', 'line_items', 'success_url', 'cancel_url']) {
    if (b[param] === undefined || b[param] === null) throw invalid('parameter_missing', `Missing required parameter: ${param}.`, param);
  }

  if (b.currency !== undefined && b.currency !== null) {
    const asked = parseCurrency(b.currency);
    if (!asked) throw invalid('currency_not_supported', `currency must be one of ${CURRENCIES.join(', ')}.`, 'currency');
    if (asked !== projectCurrency) {
      const code = CURRENCY_INFO[projectCurrency].code;
      throw invalid('currency_mismatch', `This project charges in ${code}. Send currency ${projectCurrency}, or leave it out.`, 'currency');
    }
  }

  const max = CURRENCY_INFO[projectCurrency].maxAmount;
  if (typeof b.amount !== 'number' || !Number.isInteger(b.amount)) {
    const example = `e.g. 510000 for ${formatMoney(510000, projectCurrency)}`;
    throw invalid('amount_not_integer', `amount must be a whole number in the smallest unit (${example}).`, 'amount');
  }
  if (b.amount < AMOUNT_MIN) throw invalid('amount_too_small', `amount must be at least ${AMOUNT_MIN} (${formatMoney(AMOUNT_MIN, projectCurrency)}).`, 'amount');
  if (b.amount > max) throw invalid('amount_too_large', `amount must be at most ${max} (${formatMoney(max, projectCurrency)}).`, 'amount');

  const items = b.line_items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_LINE_ITEMS || !items.every(isLineItem)) {
    throw invalid(
      'parameter_invalid',
      `line_items must be 1 to ${MAX_LINE_ITEMS} items of { name (1-200 chars), quantity (1-1000), amount (smallest unit) }.`,
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
    currency: projectCurrency,
    lineItems: items.map((i: LineItem) => ({ name: i.name.trim(), quantity: i.quantity, amount: i.amount })),
    successUrl,
    cancelUrl,
    customerEmail,
  };
}
