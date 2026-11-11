import { ApiError } from '@/lib/api/errors';
import { REFUND_REASONS, type RefundReason } from './refunds';

export type CreateRefundInput = { payment: string; amount?: number; reason: RefundReason };

const invalid = (code: string, message: string, param: string) => new ApiError(400, 'invalid_request_error', code, message, param);

export function parseCreateRefund(body: unknown): CreateRefundInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.payment !== 'string' || !b.payment) throw invalid('parameter_missing', 'Missing required param: payment.', 'payment');
  if (b.reason === undefined) throw invalid('parameter_missing', 'Missing required param: reason.', 'reason');
  if (!REFUND_REASONS.includes(b.reason as RefundReason))
    throw invalid('parameter_invalid', `reason must be one of: ${REFUND_REASONS.join(', ')}.`, 'reason');
  const out: CreateRefundInput = { payment: b.payment, reason: b.reason as RefundReason };
  if (b.amount !== undefined) {
    if (typeof b.amount !== 'number' || !Number.isInteger(b.amount))
      throw invalid('amount_not_integer', 'amount is in paisa and must be a whole number.', 'amount');
    if (b.amount < 1) throw invalid('amount_too_small', 'amount must be at least 1 paisa.', 'amount');
    out.amount = b.amount;
  }
  return out;
}
