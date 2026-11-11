import { and, eq } from 'drizzle-orm';
import { findTestCard } from '@/lib/card-guard/guard';
import { parseExpiry, validateEmail, validateName } from '@/lib/checkout/validate';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, customers, paymentActivity, payments } from '@/lib/db/schema';
import { recordEvent } from '@/lib/events/record';
import { newId } from '@/lib/ids';
import { buildReturnUrl, effectiveSessionStatus } from '@/lib/sessions/sessions';
import { type CustomerRow, type PaymentRow, toPaymentObject } from './objects';
import { DECLINES, declineFor, decideOutcome } from './outcome';

export type PayInput = {
  sessionId: string;
  attemptId: string;
  email: string;
  name: string;
  cardNumber: string;
  expiry: string;
}; // no CVC: it never leaves the browser

export type PayResult = {
  status: 'succeeded' | 'requires_action' | 'failed';
  paymentId: string;
  failure?: { code: string; declineCode: string | null; message: string };
  returnUrl?: string;
  attemptsLeft?: number;
};

export type PayErrorCode =
  | 'card_not_test_card'
  | 'session_not_found'
  | 'session_expired'
  | 'session_complete'
  | 'payment_in_progress'
  | 'invalid_field';

export class PayError extends Error {
  constructor(
    readonly code: PayErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type Tx = Db;

/** Appends timeline rows; `seq` keeps their order even when they share a timestamp. */
export async function addActivity(
  tx: Tx,
  rows: { checkoutSessionId: string; paymentId: string; kind: string; message: string; detail?: object }[],
  now: Date,
) {
  await tx.insert(paymentActivity).values(rows.map((r) => ({ id: newId('act'), detail: null, ...r, createdAt: now })));
}

export function resultFor(payment: PaymentRow, successUrl: string): PayResult {
  if (payment.status === 'requires_action') return { status: 'requires_action', paymentId: payment.id };
  if (payment.status === 'failed') {
    const d = declineFor(payment.failureCode, payment.declineCode);
    return {
      status: 'failed',
      paymentId: payment.id,
      failure: { code: payment.failureCode ?? 'card_declined', declineCode: payment.declineCode, message: d?.message ?? 'Payment failed.' },
    };
  }
  return { status: 'succeeded', paymentId: payment.id, returnUrl: buildReturnUrl(successUrl, payment.id) };
}

/** Marks the payment succeeded (if not already), completes its session and records the event. Caller holds the session lock. */
export async function completePayment(tx: Tx, payment: PaymentRow, customer: CustomerRow, now: Date): Promise<PaymentRow> {
  const [paid] = await tx.update(payments).set({ status: 'succeeded', updatedAt: now }).where(eq(payments.id, payment.id)).returning();
  await tx
    .update(checkoutSessions)
    .set({ status: 'complete', paymentId: payment.id })
    .where(eq(checkoutSessions.id, payment.checkoutSessionId));
  await recordEvent(tx, { merchantId: paid.merchantId, type: 'payment.succeeded', payload: toPaymentObject(paid, customer), now });
  return paid;
}

function validate(input: PayInput, now: Date) {
  const card = findTestCard(input.cardNumber);
  if (!card) throw new PayError('card_not_test_card', "That isn't a PaySandbox test card. Real card numbers are refused.");
  const emailError = validateEmail(input.email);
  if (emailError) throw new PayError('invalid_field', emailError, 'email');
  const nameError = validateName(input.name);
  if (nameError) throw new PayError('invalid_field', nameError, 'name');
  const expiry = parseExpiry(input.expiry, now);
  if (!expiry.ok) throw new PayError('invalid_field', expiry.message, 'expiry');
  return card;
}

export async function payCheckoutSession(db: Db, input: PayInput, now: Date): Promise<PayResult> {
  const card = validate(input, now); // before any database work: a refused number never reaches a query

  return db.transaction(async (t) => {
    const tx = t as unknown as Tx;
    const [session] = await tx.select().from(checkoutSessions).where(eq(checkoutSessions.id, input.sessionId)).for('update');
    if (!session) throw new PayError('session_not_found', 'This checkout does not exist.');

    const [repeat] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.checkoutSessionId, session.id), eq(payments.attemptId, input.attemptId)));
    if (repeat) return resultFor(repeat, session.successUrl);

    const status = effectiveSessionStatus(session, now);
    if (status === 'expired') throw new PayError('session_expired', 'This checkout has expired.');
    if (status === 'complete') throw new PayError('session_complete', 'This checkout is already paid.');
    const [pending] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.checkoutSessionId, session.id), eq(payments.status, 'requires_action')));
    if (pending) throw new PayError('payment_in_progress', 'A payment on this checkout is waiting for its OTP.');

    const email = input.email.trim().toLowerCase();
    const [customer] = await tx
      .insert(customers)
      .values({ id: newId('cus'), merchantId: session.merchantId, email, name: input.name.trim() })
      .onConflictDoUpdate({ target: [customers.merchantId, customers.email], set: { name: input.name.trim() } })
      .returning();

    const outcome = decideOutcome(card);
    const decline = outcome.kind === 'failed' ? DECLINES[outcome.decline] : null;
    const [payment] = await tx
      .insert(payments)
      .values({
        id: newId('pay'),
        merchantId: session.merchantId,
        checkoutSessionId: session.id,
        customerId: customer.id,
        attemptId: input.attemptId,
        amount: session.amount,
        status: outcome.kind,
        cardBrand: card.brand,
        cardLast4: card.number.slice(-4),
        testCard: card.key,
        failureCode: decline?.code ?? null,
        declineCode: decline?.declineCode ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const at = { checkoutSessionId: session.id, paymentId: payment.id };
    const submitted = { ...at, kind: 'card_submitted', message: 'Customer submitted card', detail: { brand: card.brand, last4: payment.cardLast4 } };

    if (outcome.kind === 'succeeded') {
      await addActivity(
        tx,
        [submitted, { ...at, kind: 'authorized', message: 'Authorized by Sandbox Bank' }, { ...at, kind: 'succeeded', message: 'Payment succeeded' }],
        now,
      );
      return resultFor(await completePayment(tx, payment, customer, now), session.successUrl);
    }
    if (outcome.kind === 'requires_action') {
      await addActivity(tx, [submitted, { ...at, kind: 'otp_requested', message: 'OTP requested (3-D Secure)' }], now);
      await recordEvent(tx, { merchantId: session.merchantId, type: 'payment.requires_action', payload: toPaymentObject(payment, customer), now });
      return resultFor(payment, session.successUrl);
    }
    await addActivity(
      tx,
      [submitted, { ...at, kind: 'failed', message: 'Payment failed', detail: { failure_code: decline!.code, decline_code: decline!.declineCode } }],
      now,
    );
    await recordEvent(tx, { merchantId: session.merchantId, type: 'payment.failed', payload: toPaymentObject(payment, customer), now });
    return resultFor(payment, session.successUrl);
  });
}
