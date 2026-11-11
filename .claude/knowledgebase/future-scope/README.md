# Future scope

What PaySandbox should add after v1, decided so that it helps as many kinds of business as possible, and so that each feature can be shown end to end on the insurance website and, where it matters, in the CRM (PolicyDesk).

**Status:** decided by Claude on 2026-11-11 at Abdul's request ("decide karka add kardo"). Order and contents are proposals; Abdul can change any of them. Nothing here is built yet.

## Principles every feature keeps
- No real money, no real cards, no real wallet or bank accounts. Every new payment method is **simulated** with its own test numbers or a "simulate" button, like the test cards.
- The TEST MODE banner stays on every customer-facing screen, including new ones.
- Free tiers only; every feature that creates work (messages, timers) gets a daily cap.
- Every feature sends webhooks, appears in the dashboard timeline, and is documented here.
- One feature at a time, each shown on the insurance website before the next starts, so PaySandbox, the website and the CRM grow together.

## Roadmap
Size: **S** = a few days, **M** = about a week, **L** = two weeks or more.

### Wave 1: make the insurance website real
| # | Feature | Size | Why |
|---|---|---|---|
| 1 | **Order reference on payments** (merchant's own order or lead ID, plus a few free notes) | S | The website and CRM can match a payment to their lead without storing extra mapping. |
| 2 | **Richer line items**: items included at 0 shown as "Included", grouped by who supplies them | S | Matches how insurance plans bundle free and paid extras. |
| 3 | **[Payment links](payment-links.md)** | M | No-code payments; an advisor can send a link from the CRM over WhatsApp. |
| 4 | **Receipts**: a shareable receipt page per payment | S | Every business needs proof of payment; the thank-you page can link to it. |
| 5 | **Coupons and discounts** (percent or fixed, expiry, usage limit) | M | Promotions for stores, events, courses. |

### Wave 2: Pakistan-first payment methods (simulated)
| # | Feature | Size | Why |
|---|---|---|---|
| 6 | **[Mobile wallet (simulated)](local-payment-methods.md#mobile-wallet)** | M | Most Pakistani customers pay with a wallet, not a card. |
| 7 | **[Bank transfer (simulated)](local-payment-methods.md#bank-transfer)**: payment stays pending until funds "arrive" | M | Teaches the pending state, common for large payments like insurance premiums. |
| 8 | **[Cash on delivery tracking](local-payment-methods.md#cash-on-delivery)** | S | Most local e-commerce still uses it; the merchant marks it collected. |
| 9 | **Multi-currency display** (AED, USD as well as PKR; no conversion) | M | The UAE-style website and overseas clients can show their own currency. |

### Wave 3: marketplaces and partners
| # | Feature | Size | Why |
|---|---|---|---|
| 10 | **[Balances and payouts](split-payments.md#balances-and-payouts)** | L | Merchants see money as pending, available and paid out. Needed before splits and commissions. |
| 11 | **[Split payments and connected sellers](split-payments.md)** | L | One payment shared between a platform and sellers (insurer + add-on provider, restaurant + rider, marketplace + shop). |
| 12 | **[Affiliates and referral commissions](affiliates.md)** | L | Influencers and partners earn a share of sales they bring; reversed on refund or dispute. |

### Wave 4: recurring revenue
| # | Feature | Size | Why |
|---|---|---|---|
| 13 | **[Saved cards](subscriptions.md#saved-cards)** | M | Pay again without typing the card; needed for subscriptions and instalments. |
| 14 | **[Test clock](subscriptions.md#test-clock)** | M | Move a project's time forward to see renewals, expiries and deadlines in seconds. |
| 15 | **[Subscriptions](subscriptions.md#subscriptions)** with trials and failed-renewal retries | L | SaaS, gyms, schools, memberships. |
| 16 | **[Instalment plans](subscriptions.md#instalment-plans)** (pay in 3 or 4) | M | Insurance premiums and expensive purchases. |
| 17 | **Invoices** with due dates and overdue reminders shown in the dashboard | M | Services, freelancers, B2B. |

### Wave 5: developers and teams
| # | Feature | Size | Why |
|---|---|---|---|
| 18 | **Team members and roles** (owner, developer, support, viewer) | M | Advisors and support staff can refund or view without the owner's login. |
| 19 | **Several webhook addresses** with event filters | M | One for the website, one for the CRM. |
| 20 | **Restricted keys** (read-only, refunds-only) | S | Give the CRM only what it needs. |
| 21 | **Reports and exports** (CSV of payments, refunds, payouts; daily summary) | S | Accounting and reconciliation. |
| 22 | **Fraud rules (simulated)**: block by amount, email or too many tries; "high risk" test card | M | Shows risk handling, a strong portfolio point. |
| 23 | **Customer portal**: a customer sees their payments and asks for a refund | M | Fewer support calls. |
| 24 | **[Card form inside the merchant's page](embedded-card-form.md)** | L | Checkout without leaving the site, like the reference site's inline card form. |

## Which businesses each feature helps
| Business type | Most useful features |
|---|---|
| **Online store** | Payment links, coupons, receipts, mobile wallet, cash on delivery, fraud rules |
| **Insurance broker** (the website) | Order reference, richer line items, payment links from advisors, instalments, split with partners, receipts, team roles for advisors |
| **Marketplace** (many sellers) | Connected sellers, split payments, balances and payouts, reports |
| **Affiliate / influencer programmes** | Referral links, commissions, reversals on refund, statements and payouts |
| **SaaS, gyms, schools, memberships** | Subscriptions, saved cards, test clock, invoices |
| **Services and freelancers** | Payment links, invoices, bank transfer, receipts |
| **Events and ticketing** | Payment links, coupons, refunds, reports |
| **Food delivery and logistics** | Cash on delivery, split payments (restaurant + rider), optional tip as a line item |

## What it means for the website and the CRM
- **Website:** each feature becomes one visible step (a coupon box, a wallet option, an instalment choice, a referral link).
- **CRM (PolicyDesk):** payment links sent by advisors, payment status from webhooks, commissions per partner, team roles for advisors.

## Open questions
- Abdul to confirm the wave order; the current order puts the insurance website's needs first.
- Whether multi-currency should move into wave 1 if the website uses AED.
