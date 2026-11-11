'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/client';
import { closeDispute, DisputeError, openDispute } from '@/lib/disputes/disputes';
import { parsePkrInput } from '@/lib/format';
import { flushJobsAfterResponse } from '@/lib/jobs/flush';
import { requireProject } from '@/lib/merchants/require-project';
import { createRefund, REFUND_REASONS, type RefundReason } from '@/lib/refunds/refunds';

type Result = { ok: true } | { ok: false; error: string };

const done = (merchantId: string, paymentId: string): Result => {
  revalidatePath(`/dashboard/${merchantId}/payments/${paymentId}`);
  flushJobsAfterResponse({ merchantId }); // sends the webhook
  return { ok: true };
};

export async function refundPaymentAction(merchantId: string, paymentId: string, amountText: string, reason: string): Promise<Result> {
  await requireProject(merchantId);
  const amount = parsePkrInput(amountText);
  if (!amount.ok) return { ok: false, error: amount.message };
  if (!REFUND_REASONS.includes(reason as RefundReason)) return { ok: false, error: 'Choose a reason.' };
  try {
    await createRefund(getDb(), { merchantId, paymentId, amount: amount.paisa, reason: reason as RefundReason, now: new Date() });
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    throw e;
  }
  return done(merchantId, paymentId);
}

export async function simulateDisputeAction(merchantId: string, paymentId: string): Promise<Result> {
  await requireProject(merchantId);
  try {
    await openDispute(getDb(), { merchantId, paymentId, reason: 'product_not_received', now: new Date() });
  } catch (e) {
    if (e instanceof DisputeError) return { ok: false, error: e.message };
    throw e;
  }
  return done(merchantId, paymentId);
}

export async function closeDisputeAction(merchantId: string, paymentId: string, disputeId: string, outcome: 'won' | 'lost'): Promise<Result> {
  await requireProject(merchantId);
  if (outcome !== 'won' && outcome !== 'lost') return { ok: false, error: 'Unknown outcome.' };
  try {
    await closeDispute(getDb(), { merchantId, disputeId, outcome, now: new Date() });
  } catch (e) {
    if (e instanceof DisputeError) return { ok: false, error: e.message };
    throw e;
  }
  return done(merchantId, paymentId);
}
