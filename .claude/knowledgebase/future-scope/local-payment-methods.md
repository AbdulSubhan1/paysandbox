# Local payment methods (simulated)

**Wave 2 · Helps:** every Pakistani business

All methods are simulations with generic names ("Mobile wallet", "Bank transfer"). Real wallet and bank names are not used, the same way real bank names are refused as project names.

## Mobile wallet
**Size M.** The customer chooses "Mobile wallet", types a **test phone number**, and a simulated "approve in your app" screen appears.
- Test numbers decide the outcome: approved, rejected by the customer, not enough balance, or no answer (times out after a set time).
- The payment waits in **requires action** until approved, rejected or timed out, then sends the usual events.
- The system shall accept only test phone numbers, refusing real ones in the browser and on the server, like card numbers.

## Bank transfer
**Size M.** The customer chooses "Bank transfer" and sees a reference number and simulated account details.
- The payment is **pending** until funds arrive. In the dashboard, the merchant clicks "Simulate funds received" (or a test reference arrives automatically after a minute).
- Partial transfers and late transfers (after the expiry) can be simulated, so merchants learn to handle them.
- New events: `payment.pending` when it starts, then `payment.succeeded` or `payment.failed`.

## Cash on delivery
**Size S.** For stores that ship first and collect later.
- The order is recorded as **awaiting collection**; the merchant (or the courier, through the API) marks it **collected** or **refused at the door**.
- The dashboard shows how much cash is still out with couriers.

## Open questions
- How long a simulated wallet approval should wait before timing out.
