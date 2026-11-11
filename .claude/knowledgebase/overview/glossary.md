# Glossary

| Term | Meaning |
|---|---|
| **Project currency** | The one currency a project charges in: PKR, USD, AED, SAR, GBP or EUR. It can change only until the project's first checkout. |
| **Smallest unit** | 1/100 of the currency: paisa, cents, fils. All amounts are stored and sent in it (PKR 1,500 = 150000; USD 299.99 = 29999). |
| **Publishable key** (`pk_test_…`) | Safe to show in a browser. It can only open the checkout. |
| **Secret key** (`sk_test_…`) | Server-only. Starts checkouts, reads payments, makes refunds. |
| **Checkout session** (`cs_test_…`) | One request to pay; it gives the customer a checkout address. |
| **Hosted checkout** | PaySandbox's own payment page (`/c/…`) the customer is sent to, like Stripe Checkout. |
| **Line item** | One row of the order summary (name, quantity, amount). Up to 20 per session. |
| **Idempotency key** | A unique key the merchant sends with each create request, so a retried request never creates a second checkout or refund. |
| **3-D Secure / OTP** | The bank's extra check. In PaySandbox it is the simulated "Sandbox Bank" screen; the code is 123456. |
| **Decline code** | Why a card was declined, e.g. `insufficient_funds`, `expired_card`. |
| **Refund** (`re_…`) | Money given back, full or partial. |
| **Dispute** (`dp_…`) | A simulated chargeback with a respond-by date. |
| **Event** (`evt_…`) | A record that something happened, sent as a webhook. |
| **Webhook** | A signed message PaySandbox sends to the merchant's server when an event happens. |
| **Standard Webhooks** | The open signing format PaySandbox uses; receivers verify with a ready-made library. |
| **Signing secret** (`whsec_…`) | The secret the merchant's server uses to check a webhook really came from PaySandbox. |
| **Project** | A merchant account; up to 3 per user. |
