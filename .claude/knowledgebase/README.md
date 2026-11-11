# PaySandbox knowledge base

PaySandbox is a **fake payment gateway offered as a product**: "Stripe test mode" for developers in Pakistan, where Stripe is not available. A developer gets test keys, sends customers to a hosted checkout page, receives signed webhooks and manages refunds and disputes in a dashboard. **No real money ever moves, and only PaySandbox's own test card numbers work.**

Live at https://paysandbox.vercel.app (invite-only).

## Start here
- [Overview](overview/README.md): what PaySandbox is, who uses it, the key rules.
- [Payment lifecycle](overview/payment-lifecycle.md): every state a payment can be in and what moves it.
- [Safety and limits](overview/safety-and-limits.md): card safety, the TEST MODE banner, daily caps.
- [Glossary](overview/glossary.md)

## Sections
| Section | What's in it |
|---|---|
| [Pages](pages/README.md) | One page per screen: sign-in, projects, the merchant dashboard, the hosted checkout |
| [Flows](flows/README.md) | End-to-end journeys: taking a payment, OTP, refunds, disputes, webhook delivery |
| [Integrations](integrations/README.md) | How a merchant site connects, the insurance website, and the CRM (PolicyDesk) link |
| [Future scope](future-scope/README.md) | Decided roadmap after v1: payment links, local payment methods, split payments, affiliates, subscriptions and more, mapped to business types |

## What is live today
| Release | Delivered |
|---|---|
| v0.1.0 (Plan 1) | Invite-only GitHub sign-in, projects and keys, checkout sessions, hosted checkout with every test-card outcome and OTP, redirect back |
| v0.2.0 (Plan 2) | Signed webhooks with retries, session expiry and dispute deadline timers, refunds, disputes |
| v0.3.0 (Plan 3) | Merchant dashboard: overview, payments, customers, disputes, test cards, developers page, webhooks, API request log, project switcher |
| Plan 4 (written, not built) | Guest demo sandboxes, demo store, public docs page, admin page, security and release checks |
