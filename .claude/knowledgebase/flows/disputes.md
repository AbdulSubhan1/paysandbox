# Disputes

1. A dispute opens in one of two ways: the customer paid with **4000 0000 0000 0259** (a dispute opens about a minute after the payment succeeds), or the merchant picks **More → Simulate dispute** on a payment and confirms.
2. The payment becomes **disputed**, the dispute is for the amount left, the respond-by date is 7 days later, and `dispute.created` is sent.
3. The merchant answers on the payment page:
   - **Win:** the payment goes back to the state it had before.
   - **Accept and lose:** the payment becomes **dispute lost**.
4. If nobody answers by the respond-by date, the dispute is **lost automatically**.
5. `dispute.closed` is sent when it closes.

## Rules
- The system shall block refunds while the dispute is open.
- Disputes are managed in the dashboard only; there is no API for them in v1.
