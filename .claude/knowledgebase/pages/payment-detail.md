# Payment detail

**Area:** dashboard · **Who uses it:** merchant · **Reached from:** Payments → a payment

## What this page is for
Everything about one payment: what happened, when, and what the merchant can do next.

## What it shows
- The amount, status and IDs (payment, checkout session, customer).
- **Details:** card brand and last 4, which test card, decline reason if any.
- **Timeline:** every step (created, OTP asked, succeeded or failed, refunded, dispute opened or closed) with times.
- **Refunds:** each refund with amount, reason and time.
- **Webhooks for this payment:** every event sent for it and whether it was delivered.
- An open dispute panel when the payment is disputed.

## What the user can do
- **Refund this payment:** choose an amount (defaults to the amount left) and a reason. A toast confirms that a `refund.created` webhook is on its way.
- **Simulate dispute:** opens a dispute for the amount left, as if the customer's bank challenged it.
- **Answer a dispute:** "Win" (the payment returns to its previous state) or "Accept and lose".

## Rules
- The system shall offer refunds only on succeeded or partially refunded payments, and never more than the amount left.
- The system shall block refunds while a dispute is open.
- The system shall keep the refund amount box in step with the amount left after each refund.
- The system shall show a 404 page for a payment that belongs to another project.

## Open questions
- None.

## Screenshots
![Payment detail](../assets/screenshots/dashboard/payment-detail.png)
