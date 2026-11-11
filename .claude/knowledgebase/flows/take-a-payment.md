# Take a payment

**Who:** merchant's server, customer, PaySandbox.

1. The customer clicks "Pay" on the merchant's site.
2. The merchant's server asks PaySandbox for a **checkout session** with its secret key: the amount, up to 20 line items, the success and cancel addresses, optionally the customer's email, and an idempotency key so a retried request never creates two sessions.
3. PaySandbox answers with a checkout address; the merchant's site sends the customer there in the same tab.
4. The customer sees the TEST MODE banner, the order summary and the card form, picks or types a test card and pays.
5. PaySandbox shows "Processing…" briefly, then the outcome:
   - **Succeeded:** success screen → "Back to the store" → the merchant's success address with the payment ID.
   - **Declined:** the reason and "Try another card" (a new attempt on the same session).
   - **OTP card:** see [OTP](otp.md).
6. PaySandbox sends `payment.succeeded` (or `payment.failed`) to the merchant's webhook address. The merchant should mark the order paid **from the webhook**, not from the redirect, because the customer may close the tab before returning.
7. The payment appears in the dashboard with its timeline.

## Rules
- The system shall accept amounts from PKR 1 to PKR 1,000,000 and at most 20 line items per session.
- The system shall accept https success and cancel addresses (or `http://localhost` for local development).
- The system shall return the original answer, marked as a replay, when the same idempotency key is sent again with the same request; a different request with the same key is refused.
- The system shall expire an unpaid session after 24 hours.
