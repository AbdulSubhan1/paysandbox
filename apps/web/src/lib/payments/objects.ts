import type { customers, payments } from '@/lib/db/schema';

export type PaymentRow = typeof payments.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;

/** The public API shape of a payment (openapi.yaml#/components/schemas/Payment). */
export function toPaymentObject(row: PaymentRow, customer: Pick<CustomerRow, 'id' | 'name' | 'email'>) {
  return {
    id: row.id,
    object: 'payment' as const,
    amount: row.amount,
    amount_refunded: row.amountRefunded,
    currency: 'pkr' as const,
    status: row.status,
    customer: { id: customer.id, name: customer.name, email: customer.email },
    card: { brand: row.cardBrand, last4: row.cardLast4 },
    failure_code: row.failureCode,
    decline_code: row.declineCode,
    checkout_session: row.checkoutSessionId,
    created: Math.floor(row.createdAt.getTime() / 1000),
    livemode: false as const,
  };
}
