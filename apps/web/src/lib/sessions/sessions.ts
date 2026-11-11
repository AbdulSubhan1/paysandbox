import { and, eq } from 'drizzle-orm';
import type { ApiContext } from '@/lib/api/handler';
import { consumeUsage, dailyLimitError } from '@/lib/api/usage';
import type { Db } from '@/lib/db/client';
import { checkoutSessions, merchants, paymentActivity } from '@/lib/db/schema';
import { newId } from '@/lib/ids';
import { addHours } from '@/lib/time';
import type { CreateSessionInput } from './input';

export const SESSION_TTL_HOURS = 24;

export type CheckoutSessionRow = typeof checkoutSessions.$inferSelect;
export type SessionStatus = CheckoutSessionRow['status'];

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export async function createCheckoutSession(ctx: ApiContext, input: CreateSessionInput): Promise<CheckoutSessionRow> {
  const usage = await consumeUsage(ctx.db, ctx.merchantId, 'checkout_sessions', ctx.now);
  if (!usage.allowed) throw dailyLimitError('checkout_sessions', usage);

  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(checkoutSessions)
      .values({
        id: newId('cs_test'),
        merchantId: ctx.merchantId,
        amount: input.amount,
        currency: input.currency,
        lineItems: input.lineItems,
        customerEmail: input.customerEmail,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt: addHours(ctx.now, SESSION_TTL_HOURS),
        idempotencyKey: ctx.idempotencyKey,
        createdAt: ctx.now,
      })
      .returning();
    await tx.insert(paymentActivity).values({
      id: newId('act'),
      checkoutSessionId: row.id,
      kind: 'session_created',
      message: 'Checkout session created',
      detail: ctx.idempotencyKey ? { idempotency_key: ctx.idempotencyKey } : null,
      createdAt: ctx.now,
    });
    return row;
  });
}

export async function getCheckoutSession(db: Db, merchantId: string, id: string): Promise<CheckoutSessionRow | null> {
  const [row] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, id), eq(checkoutSessions.merchantId, merchantId)));
  return row ?? null;
}

/** For the hosted checkout page: by ID only (the unguessable session ID is the capability). */
export async function getSessionForCheckout(db: Db, id: string): Promise<(CheckoutSessionRow & { merchantName: string }) | null> {
  const [row] = await db
    .select({ session: checkoutSessions, merchantName: merchants.name })
    .from(checkoutSessions)
    .innerJoin(merchants, eq(merchants.id, checkoutSessions.merchantId))
    .where(eq(checkoutSessions.id, id));
  return row ? { ...row.session, merchantName: row.merchantName } : null;
}

/** Read-time expiry: never writes. */
export function effectiveSessionStatus(row: Pick<CheckoutSessionRow, 'status' | 'expiresAt'>, now: Date): SessionStatus {
  return row.status === 'open' && row.expiresAt <= now ? 'expired' : row.status;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

export function toSessionObject(row: CheckoutSessionRow, now: Date) {
  return {
    id: row.id,
    object: 'checkout_session' as const,
    url: `${appUrl()}/c/${row.id}`,
    amount: row.amount,
    currency: row.currency,
    line_items: row.lineItems,
    customer_email: row.customerEmail,
    success_url: row.successUrl,
    cancel_url: row.cancelUrl,
    status: effectiveSessionStatus(row, now),
    payment: row.paymentId,
    expires_at: unix(row.expiresAt),
    created: unix(row.createdAt),
    livemode: false as const,
  };
}

export function buildReturnUrl(successUrl: string, paymentId: string): string {
  const url = new URL(successUrl);
  url.searchParams.set('pay', paymentId);
  return url.toString();
}
