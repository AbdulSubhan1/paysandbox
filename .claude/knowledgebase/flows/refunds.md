# Refunds

1. The merchant opens a succeeded payment and chooses **Refund this payment** (or their server asks for a refund with the secret key).
2. The amount defaults to the amount left; the merchant can lower it for a partial refund, and picks a reason.
3. PaySandbox records the refund, updates the payment to **partially refunded** or **refunded**, adds it to the timeline and sends `refund.created`.

## Rules
- The system shall refund only succeeded or partially refunded payments.
- The system shall never refund more than the amount left, even when two refunds arrive at the same moment.
- The system shall block refunds while a dispute is open.
- A refund sent through the API with an idempotency key is never made twice.
