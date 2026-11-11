# PaySandbox: test plan and test cases

Version 0.1 · 2026-11-11 · written from the clickable mockup (`index.html`) and from how real gateways behave in test mode (Stripe used as the reference).
Structure follows ISO/IEC/IEEE 29119-3 (test documentation): plan → design techniques → cases → exit criteria.

---

## 1. What we test against (global standards)

| Standard | What it means for PaySandbox | Test areas |
|---|---|---|
| **ISTQB** test design techniques | Equivalence partitions, boundary values, decision tables, state transitions. Each case below names its technique. | all |
| **ISO/IEC/IEEE 29119-3** | Shape of this document: plan, cases, exit criteria, defect report. | this file |
| **PCI DSS v4.0** (spirit only, we never hold real cards) | Never store, log or send a real card number (PAN); never store CVC at all. Card numbers masked to last 4 everywhere. | CG, SEC |
| **OWASP ASVS 4.0 Level 2** | Auth, session, input validation, output encoding, secrets, logging. | SEC, API |
| **OWASP API Security Top 10 (2023)** | API1 object-level auth (merchant A can't read merchant B), API2 broken auth, API4 rate limits, API7 SSRF via webhook URL. | API, WH, SEC |
| **IETF Idempotency-Key header draft** (`draft-ietf-httpapi-idempotency-key-header`) | Same key replays the first response; same key + different body → **422**; same key while first call still running → **409**. | IDEM |
| **Standard Webhooks spec** (standardwebhooks.com) | `webhook-id`, `webhook-timestamp`, `webhook-signature` headers, HMAC-SHA256 over `id.timestamp.body`, 5-minute replay window, at-least-once delivery, retries with backoff. | WH |
| **EMV 3-D Secure 2** (behaviour only) | OTP challenge → `requires_action`, pass → succeeded, fail/cancel → `authentication_failed`. | 3DS |
| **WCAG 2.2 AA** | Checkout and dashboard usable by keyboard and screen reader, 4.5:1 contrast, errors announced. | A11Y |
| **Core Web Vitals** | Checkout: LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on a mid-range phone. | PERF |
| **ISO 4217** | Currency code `PKR`, 2 decimal places, amounts sent as integer paisa. | API, DATA |

> **Decided 2026-11-11:** webhooks follow **Standard Webhooks**. Each request carries `webhook-id` (the event ID, same on every retry), `webhook-timestamp` (unix seconds) and `webhook-signature` (`v1,<base64 HMAC-SHA256>` over `id.timestamp.body`, key = secret after `whsec_`). Merchants verify with the official `standardwebhooks` library, so no PaySandbox SDK is needed. During a secret roll the header carries two space-separated signatures (old and new).

---

## 2. What Stripe test mode does (reverse-engineered reference behaviour)

These are the behaviours a developer will expect, because they learned them on Stripe:

1. **Amounts are integers in the smallest unit** (`510000` = PKR 5,100.00). Floats are rejected.
2. **Keys:** `pk_test_` is for the browser only and can't create payments, refunds or read data. `sk_test_` is for the server only. A rolled secret key keeps working for a grace period (we use 24 h).
3. **Idempotency:** keys are remembered for 24 h. A replay returns the same body and status, plus the header `Idempotent-Replayed: true`.
4. **Checkout session:** created by the server, opened by URL, expires after 24 h, can be paid only once.
5. **Payment states:** `requires_action` (OTP), `succeeded`, `failed`, then `partially_refunded` / `refunded`, `disputed`.
6. **Decline codes:** `card_declined` + `decline_code` (`insufficient_funds`, `generic_decline`), `expired_card`, `incorrect_cvc`, `processing_error`, `authentication_failed`.
7. **Refunds:** many partial refunds allowed until the total is reached; never more than the amount left; no refund while a dispute is open.
8. **Webhooks:** at-least-once delivery (duplicates possible), order not guaranteed, each event has a stable ID, a 2xx stops retries, failing endpoints are retried with backoff and disabled after repeated failure (and the merchant is told).
9. **Events carry a snapshot** of the object at the time of the event, not a live link.
10. **Test card numbers are public and fixed**; we reuse Stripe's well-known numbers so developers' knowledge carries over.

---

## 3. Payment state machine (state-transition testing)

```
requires_payment_method ──submit──▶ processing ──▶ succeeded ──refund(part)──▶ partially_refunded ──refund(rest)──▶ refunded
                                         │  │            │  ▲                         │
                                         │  │            │  └──── dispute won ◀──┐    │
                                         │  │            └──dispute──▶ disputed ─┤◀───┘
                                         │  │                                  └── dispute lost ──▶ dispute_lost
                                         │  └──▶ failed  (decline codes)
                                         └──▶ requires_action ──OTP ok──▶ succeeded
                                                       └──OTP fail / cancel / 24 h──▶ failed (authentication_failed)
```

**Invalid transitions (each must return an error and change nothing):** refund a `failed`, `requires_action`, `refunded` or `disputed` payment; dispute a `failed` payment; open a second dispute; close a closed dispute; pay an already paid or expired session.

---

## 4. Test levels, tools and environments (all free)

| Level | Tool | Runs where | Owns |
|---|---|---|---|
| Unit | **Vitest** | every commit, GitHub Actions | card guard, money, state machine, signature, idempotency logic |
| Component | **Vitest + Testing Library** | every commit | CardNumberInput, RefundForm, StatusBadge, OTP dialog |
| API / integration | **Vitest + real Postgres** (a Neon branch per CI run, deleted after) | every PR | routes, DB writes, idempotency store, refunds |
| Contract | **OpenAPI 3.1 spec + schema check** on every API response | every PR | response shapes never drift from docs |
| End-to-end | **Playwright** (Chromium, Firefox, WebKit + Pixel 7 / iPhone 14 viewports) | every PR (smoke), nightly (full) | redirect flow, all test cards, dashboard actions |
| Webhook receiver | a tiny test endpoint in the repo that records what it receives | E2E + nightly | signatures, retries, duplicates |
| Accessibility | **@axe-core/playwright** + manual keyboard / NVDA pass | every PR (axe), before release (manual) | WCAG 2.2 AA |
| Security | **OWASP ZAP baseline** (GitHub Action), `npm audit`, gitleaks | weekly + before release | headers, XSS, secrets |
| Performance | **Lighthouse CI** (checkout), **k6** small load (100 virtual users) | before release | Core Web Vitals, API p95 |

**Environments:** `local` → `preview` (Vercel preview per PR, Neon branch) → `production` (Vercel, Neon main).
**Test merchants:** *Merchant A* (Chai Code Co.) and *Merchant B* (a second account) to prove data never crosses between merchants.

---

## 5. Test data: test cards

| Number | Result | Decline code |
|---|---|---|
| 4242 4242 4242 4242 | Succeeds | none |
| 5555 5555 5555 4444 | Succeeds (Mastercard) | none |
| 4000 0000 0000 9995 | Declined | `card_declined` / `insufficient_funds` |
| 4000 0000 0000 0069 | Declined | `expired_card` |
| 4000 0000 0000 0002 | Declined | `card_declined` / `generic_decline` |
| 4000 0000 0000 0127 | Declined | `incorrect_cvc` |
| 4000 0000 0000 0119 | Error | `processing_error` |
| 4000 0000 0000 3220 | OTP required | OTP `123456` passes, anything else gives `authentication_failed` |
| 4000 0000 0000 0259 | Succeeds, then a dispute opens | none |

**Real-looking cards used only to prove refusal** (Luhn-valid, not ours): `5398 2283 4729 1056`, `4111 1111 1111 1111`, `3782 822463 10005` (Amex shape).

---

## 6. Test cases

**Priority:** P0 = blocks release (money, safety, data leak) · P1 = must pass for a good v1 · P2 = nice to have.
**Level:** U unit · C component · API · E2E · M manual · SEC · A11Y · PERF.
**Technique:** EP equivalence partition · BVA boundary value · DT decision table · ST state transition · EG error guessing.
Cases tagged **@smoke** form the 10-minute suite that runs on every PR.

### A. Card guard: real cards never accepted (PCI spirit) · area `CG`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-CG-001 @smoke | Type `4242 4242 4242 4242` | Accepted, brand shows VISA, Pay button enabled | P0 | C, E2E | EP |
| PS-CG-002 @smoke | Type `5398` (first 4 digits of a non-test card) | Field cleared, error shown, Pay disabled | P0 | C, E2E | EP |
| PS-CG-003 | Type 3 digits `539` | No error yet (could still be a test card) | P1 | C | BVA |
| PS-CG-004 | Paste a full real-looking number `5398228347291056` | Cleared at once, error shown, Pay disabled | P0 | C, E2E | EP |
| PS-CG-005 | Paste with spaces / dashes `5398-2283-4729-1056` | Same as 004 | P1 | C | EG |
| PS-CG-006 | Type a test-card prefix then a wrong digit `4242 4243` | Cleared, error shown | P0 | C | BVA |
| PS-CG-007 | 15 digits of a test card | Pay disabled (incomplete), no error | P1 | C | BVA |
| PS-CG-008 | 17+ digits | Input stops at 16 digits | P2 | C | BVA |
| PS-CG-009 | Letters, emoji, Arabic/Urdu digits `٤٢٤٢` | Non-ASCII digits stripped or rejected; never stored | P1 | C | EG |
| PS-CG-010 @smoke | Try a real card, then watch the network tab | **No request contains any digit sequence of the refused number** | P0 | E2E, SEC | EG |
| PS-CG-011 | Try a real card, then check server logs, DB, Sentry/analytics events | Refused number appears nowhere | P0 | SEC, M | EG |
| PS-CG-012 | Bypass the browser: POST a real-looking number straight to the pay API | Server also refuses (**400 `card_not_test_card`**); the number is not logged | P0 | API, SEC | EG |
| PS-CG-013 | Inspect DB after a test payment | Only brand + last 4 stored; **CVC never stored**; expiry not stored | P0 | API | EG |
| PS-CG-014 | Browser autofill offers a saved real card | Field has `autocomplete="off"`; if filled anyway, it's refused and cleared like 004 | P1 | M | EG |
| PS-CG-015 | Screen reader on refusal | Error is announced (`role="alert"`), the field points to it with `aria-describedby` | P1 | A11Y | none |

### B. Checkout outcomes per test card (decision table) · area `CO`

| ID | Card | Expected status / screen | Webhook | Pri | Level |
|---|---|---|---|---|---|
| PS-CO-001 @smoke | 4242… | `succeeded`, success screen, redirect to `success_url` | `payment.succeeded` | P0 | E2E |
| PS-CO-002 | 5555…4444 | `succeeded`, brand Mastercard | `payment.succeeded` | P1 | E2E |
| PS-CO-003 @smoke | …9995 | `failed`, "insufficient funds", codes shown | `payment.failed` | P0 | E2E |
| PS-CO-004 | …0069 | `failed`, "card has expired" | `payment.failed` | P0 | E2E |
| PS-CO-005 | …0002 | `failed`, generic decline | `payment.failed` | P1 | E2E |
| PS-CO-006 | …0127 | `failed`, incorrect CVC | `payment.failed` | P1 | E2E |
| PS-CO-007 | …0119 | `failed`, processing error; retry with same session works | `payment.failed` | P1 | E2E |
| PS-CO-008 | …0259 | `succeeded`, then `disputed` within 1 min | `payment.succeeded` then `dispute.created` | P1 | E2E |
| PS-CO-009 | Declined, then "Try another card" with 4242 | Same session now `succeeded`; the failed attempt is kept in the timeline | P0 | E2E |
| PS-CO-010 | Double-click Pay | Exactly **one** payment created | P0 | E2E | 
| PS-CO-011 | Close tab during "Processing…" and reopen session URL | Shows the final result, not the form again | P1 | E2E |
| PS-CO-012 | Amount and merchant name on checkout | Match the session created by the server, not URL params | P0 | E2E |

### C. 3-D Secure / OTP · area `3DS`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-3DS-001 @smoke | Card …3220, OTP `123456` | `requires_action` → `succeeded`; timeline shows OTP requested + verified | P0 | E2E | ST |
| PS-3DS-002 | OTP `000000` | `failed` / `authentication_failed` | P0 | E2E | EP |
| PS-3DS-003 | Cancel on the bank screen | `failed` / `authentication_failed` | P0 | E2E | ST |
| PS-3DS-004 | OTP with 5 digits / letters | Verify disabled or error, no state change | P1 | C | BVA |
| PS-3DS-005 | Close the browser on the OTP screen | Payment stays `requires_action` ("Needs OTP" in dashboard); at session expiry (24 h) it becomes `failed` / `authentication_failed` and `payment.failed` is sent then, without anyone opening it | P1 | API, E2E | ST |
| PS-3DS-006 | Wrong OTP 3 times | Payment fails after the 3rd try (no unlimited guessing) | P2 | API | BVA |
| PS-3DS-007 | Keyboard only | Focus moves into the OTP dialog, Tab stays inside it, Esc cancels, focus returns to Pay | P1 | A11Y | none |

### D. Checkout form validation · area `FV`

*Found in the mockup QA (section 8): today the form pays with an empty email, no CVC and a past expiry.*

| ID | Field / input | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-FV-001 | Email empty | "Enter your email", Pay blocked | P1 | C | EP |
| PS-FV-002 | Email `ayesha@` / `ayesha.example.com` | "Enter a valid email" | P1 | C | EP |
| PS-FV-003 | Expiry = current month (e.g. `11 / 26` in Nov 2026) | Accepted | P1 | U | BVA |
| PS-FV-004 | Expiry = last month (`10 / 26`) | "Expiry date is in the past" | P1 | U | BVA |
| PS-FV-005 | Expiry month `00` / `13` | "Invalid month" | P1 | U | BVA |
| PS-FV-006 | Expiry 20+ years ahead | "Invalid year" | P2 | U | BVA |
| PS-FV-007 | CVC 2 digits / 3 digits / 4 digits | 2 → error; 3 → OK; 4 → error for Visa/MC | P1 | U | BVA |
| PS-FV-008 | Name 0 chars / 1 char / 100 chars / Urdu name `عائشہ خان` | Empty → error; others accepted and shown correctly | P2 | C | BVA |
| PS-FV-009 | Name `<img src=x onerror=alert(1)>` | Shown as text in dashboard; no script runs | P0 | SEC | EG |

### E. Redirect flow (separate URL, like Tabby) · area `RD`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-RD-001 @smoke | Store → Checkout → pay → back | Browser goes `my-store…/cart` → `paysandbox.vercel.app/c/cs_test_…` → `success_url?pay=pay_…` | P0 | E2E | none |
| PS-RD-002 | "Back to store" on checkout | Goes to `cancel_url`; session stays `open` | P1 | E2E | none |
| PS-RD-003 | Open a paid session URL again | "Already paid" page with link to `success_url`; cannot pay twice | P0 | E2E | ST |
| PS-RD-004 | Open a session URL after 24 h | "This checkout has expired" | P1 | API, E2E | ST |
| PS-RD-005 | Random / wrong session ID | 404 page, no merchant data leaked | P1 | E2E | EG |
| PS-RD-006 | Session created with `success_url` = `http://…` (not https) | API 400 (localhost allowed for dev) | P1 | API | EP |
| PS-RD-007 | Try to change `success_url` via the checkout URL query (`?success_url=evil.com`) | Ignored; only the server-set URL is used (no open redirect) | P0 | SEC | EG |
| PS-RD-008 | Checkout page inside an `<iframe>` on another site | Blocked (`frame-ancestors 'none'`), so no one can crop out the TEST MODE banner | P0 | SEC | EG |

### F. API keys and auth (OWASP API1, API2) · area `AUTH`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-AUTH-001 @smoke | Create session with `sk_test_` | 200 | P0 | API |
| PS-AUTH-002 | Create session with `pk_test_` | 401 `invalid_api_key` "publishable key can't be used here" | P0 | API |
| PS-AUTH-003 | No key / malformed header | 401 | P0 | API |
| PS-AUTH-004 | A `sk_live_…`-shaped key | 401 "PaySandbox has no live mode" | P1 | API |
| PS-AUTH-005 @smoke | Merchant B's key reads Merchant A's `pay_…` | **404** (not 403, so IDs can't be probed) | P0 | API, SEC |
| PS-AUTH-006 | Merchant B refunds Merchant A's payment | 404, nothing changes | P0 | API, SEC |
| PS-AUTH-007 | Roll secret key | New key works at once; old key works for 24 h, then 401 | P1 | API |
| PS-AUTH-008 | Dashboard API without login cookie | 401 / redirect to login | P0 | API |
| PS-AUTH-009 | Secret key ever in the client JS bundle or HTML | Never (scan build output for `sk_test_`) | P0 | SEC |
| PS-AUTH-010 | 1,001st API request in one day (cap 1,000) | 429 `daily_limit_reached` with `Retry-After`; not written to the API log; demo merchant has its own larger cap | P1 | API |
| PS-AUTH-012 @smoke | GitHub user not on the allowlist logs in | "Invite-only" page; no user or merchant row created | P0 | E2E |
| PS-AUTH-013 | Admin adds a GitHub username to the allowlist | That user can now sign up | P1 | E2E |
| PS-AUTH-014 | User creates a 4th merchant (max 3) | Refused with a clear message | P2 | E2E |
| PS-AUTH-015 | User with 2 merchants switches between them | Keys, payments and webhooks shown belong only to the selected merchant | P0 | E2E |
| PS-AUTH-011 | 201st checkout session in one day (cap 200) | 429 `daily_limit_reached` | P1 | API |

### G. Idempotency (IETF draft) · area `IDEM`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-IDEM-001 @smoke | Same POST twice, same `Idempotency-Key`, same body | Same response, same `cs_…` ID, header `Idempotent-Replayed: true`; only one row in DB | P0 | API | EG |
| PS-IDEM-002 | Same key, different amount | **422** `idempotency_key_reused` | P0 | API | DT |
| PS-IDEM-003 | Same key sent twice at the same moment (parallel) | One 200, the other **409** (or waits and replays); never two sessions | P0 | API | EG |
| PS-IDEM-004 | Same key after 24 h | Treated as a new request | P2 | API | BVA |
| PS-IDEM-005 | Same key, different merchant | Independent: keys are per merchant | P1 | API | EP |
| PS-IDEM-006 | First request failed with 500 | Retry with same key re-runs (errors from our side are not cached); 4xx validation errors are cached | P1 | API | DT |
| PS-IDEM-007 | Key longer than 255 chars / empty | 400 | P2 | API | BVA |
| PS-IDEM-008 | Refund POST twice with same key | One refund only | P0 | API | EG |

### H. Checkout session API validation · area `CS`

| ID | Input | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-CS-001 | `amount` = 0 / -1 | 400 `amount_too_small` | P1 | API | BVA |
| PS-CS-002 | `amount` = minimum (e.g. 100 paisa = PKR 1) | 200 | P1 | API | BVA |
| PS-CS-003 | `amount` = 100,000,000 paisa (PKR 1,000,000, the max) and max + 1 | 200 / 400 `amount_too_large` | P1 | API | BVA |
| PS-CS-004 | `amount` = `5100.50` (float) or `"5100"` (string) | 400 "amount must be an integer in paisa" | P0 | API | EP |
| PS-CS-005 | `currency` = `pkr` / `PKR` / `usd` / `xyz` | pkr/PKR OK; others 400 (v1 = PKR only) | P1 | API | EP |
| PS-CS-006 | Missing `success_url` or `cancel_url` | 400 naming the field | P1 | API | EP |
| PS-CS-007 | 21 line items (max 20) / 1,000-char item name | Published limits enforced, clear 400 | P2 | API | BVA |
| PS-CS-008 | Every response | Matches the OpenAPI schema; `livemode: false` always | P0 | API | none |

### I. Refunds · area `RF`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-RF-001 @smoke | Full refund of PKR 5,100 | `refunded`, timeline entry, `refund.created` webhook | P0 | API, E2E | ST |
| PS-RF-002 | Partial PKR 1,000 then PKR 4,100 | `partially_refunded` → `refunded`; two refund rows | P0 | API | ST |
| PS-RF-003 | Refund amount left + 1 paisa | 400 `amount_too_large` | P0 | API | BVA |
| PS-RF-004 | Refund exactly the amount left | OK → `refunded` | P0 | API | BVA |
| PS-RF-005 | Refund 0 / negative / 0.001 | 400 | P1 | API, C | BVA |
| PS-RF-006 | Refund a `failed` / `requires_action` payment | 400 `payment_not_refundable` | P0 | API | ST |
| PS-RF-007 | Refund while dispute is open | 400 `payment_disputed` | P1 | API | ST |
| PS-RF-008 | Two partial refunds sent in parallel that together exceed the amount | Only one succeeds (row lock / transaction) | P0 | API | EG |
| PS-RF-009 | Dashboard totals after refunds | Net = succeeded − refunded − lost disputes, to the paisa | P0 | API, E2E | none |
| PS-RF-010 | Refund form in dashboard | Default = amount left; reason required; button disabled while sending | P1 | C | none |

### J. Disputes · area `DP`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-DP-001 | "Simulate dispute" on a succeeded payment | `disputed`, amount on hold, respond-by date = +7 days, `dispute.created` | P1 | E2E | ST |
| PS-DP-002 | Dispute a partially refunded payment | Dispute amount = amount left, not the full amount | P1 | API | BVA |
| PS-DP-003 | Win | Status returns to the previous one; `dispute.closed` with `won` | P1 | API | ST |
| PS-DP-004 | Lose | `dispute_lost`; net volume drops by the dispute amount | P1 | API | ST |
| PS-DP-005 | Second dispute on same payment / close twice | 400, nothing changes | P1 | API | ST |
| PS-DP-006 | "Accept and lose" needs a confirm dialog | Cancel does nothing | P2 | C | none |
| PS-DP-007 | Respond-by date passes with no answer | Dispute lost automatically, `dispute_lost`, `dispute.closed` sent at that time | P1 | API | ST |

### K. Webhooks (Standard Webhooks) · area `WH`

| ID | Scenario | Expected result | Pri | Level | Tech |
|---|---|---|---|---|---|
| PS-WH-001 @smoke | A payment succeeds | Endpoint gets POST with `webhook-id`, `webhook-timestamp`, `webhook-signature`; official Standard Webhooks library verifies it | P0 | E2E | none |
| PS-WH-002 | Body changed by 1 byte | Verification fails | P0 | U | EG |
| PS-WH-003 | Timestamp 6 minutes old (replayed request) | Verification fails (5-minute window) | P0 | U | BVA |
| PS-WH-004 | Endpoint returns 500, then 200 | Retried; delivered on attempt 2; same `webhook-id` both times | P0 | E2E | ST |
| PS-WH-005 | Endpoint times out (> 15 s) | Counted as failure, retried | P1 | E2E | EG |
| PS-WH-006 | Endpoint returns 301/302 | Treated as failure (redirects not followed) | P2 | API | EG |
| PS-WH-007 | Endpoint always fails | 6 attempts on the published schedule, then delivery `failed`; after 20 consecutive failed events the endpoint is disabled and the dashboard shows a banner with "Re-enable" | P1 | API | ST |
| PS-WH-008 | Retry timing | Each attempt within ±1 min of schedule (depends on the queue chosen, see risk R2) | P1 | API | none |
| PS-WH-009 | Resend from dashboard | New attempt, same event ID | P1 | E2E | none |
| PS-WH-010 | "Send test event" for each type | Delivered, payload matches docs | P1 | E2E | EP |
| PS-WH-011 | Event payload | Snapshot of the object at that moment; `livemode: false`; amounts in paisa | P0 | API | none |
| PS-WH-012 | Refund then payment events arrive out of order | Docs warn; each event has `created`; receiver example handles it | P2 | M | EG |
| PS-WH-013 | Endpoint URL `http://localhost`, `http://127.0.0.1`, `http://169.254.169.254`, `http://10.0.0.5`, a hostname that resolves to a private IP | **Rejected (SSRF, OWASP API7)**, both when saved and at send time | P0 | SEC | EP |
| PS-WH-014 | Endpoint returns a 10 MB body | We read at most ~64 KB, no crash | P2 | SEC | EG |
| PS-WH-016 | Signing secret rolled | For 24 h `webhook-signature` has two signatures (`v1,old v1,new`); a receiver with either secret verifies | P1 | API | ST |
| PS-WH-017 | Verify with the official `standardwebhooks` library in JS and Python | Both pass on a real delivery (contract test) | P0 | API | none |
| PS-WH-015 | Signing secret shown in dashboard | Masked by default; reveal requires being logged in; roll secret supported | P1 | E2E | none |

### L. Dashboard · area `DB`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-DB-001 @smoke | Overview totals | Each tile equals a SQL sum over the merchant's own payments | P0 | API, E2E |
| PS-DB-002 | Status filter chips | Counts on chips = rows shown | P1 | E2E |
| PS-DB-003 | Payment detail timeline | Events in time order; matches DB events | P1 | E2E |
| PS-DB-004 | Customers grouped by email | One row per email; net paid = sum − refunds | P1 | API |
| PS-DB-005 | Empty merchant (new account) | Empty states with "make your first test payment" link, no errors | P1 | E2E |
| PS-DB-006 | 1,000 payments | List paginates; page loads < 1 s | P2 | PERF |
| PS-DB-007 | Times shown | In Pakistan time (PKT) in the UI, UTC ISO-8601 in the API | P1 | E2E |
| PS-DB-008 | Money | Always `PKR 1,234.56`; no float drift (`0.1 + 0.2` problem) because math is done in paisa | P0 | U |
| PS-DB-009 | Test mode pill / live toggle | Always on test; toggle disabled with explanation | P2 | E2E |

### M. Developers page and npm package · area `DEV`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-DEV-001 | Code snippets | Each snippet is compiled and run in CI against preview (snippets can't silently go stale) | P1 | API |
| PS-DEV-002 | `@paysandbox/react` button in a fresh Next.js app | Installs, renders, redirects; bundle < 5 KB gzip; no Tailwind needed | P1 | E2E |
| PS-DEV-003 | Secret key create / roll | Full key shown once with Copy; after leaving the page only `sk_test_…` + last 4 is visible; DB holds only a hash | P1 | E2E |
| PS-DEV-004 | API request log | Shows method, path, status, idempotency key; never shows request bodies with card data | P1 | E2E |

### N. Security (OWASP ASVS L2) · area `SEC`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-SEC-001 | Merchant name / line item `<script>alert(1)</script>` | Shown as text on checkout and dashboard | P0 | SEC |
| PS-SEC-002 | Response headers on checkout | CSP, `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy` | P0 | SEC |
| PS-SEC-003 | Dashboard cookies | `HttpOnly`, `Secure`, `SameSite=Lax`; state-changing calls need CSRF protection | P0 | SEC |
| PS-SEC-004 | Logs and error tracking | No API secrets, webhook secrets, OTPs or full card numbers | P0 | SEC |
| PS-SEC-005 | Dependencies | `npm audit` no high/critical; gitleaks finds no secrets in git history | P1 | SEC |
| PS-SEC-006 | ZAP baseline scan | No high alerts | P1 | SEC |
| PS-SEC-007 | Login brute force | Rate limited / lockout after N tries | P1 | SEC |

### O. Abuse and anti-phishing · area `AB`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-AB-001 @smoke | TEST MODE banner | Present on every checkout state: form, processing, OTP, success, declined, expired, 404 | P0 | E2E |
| PS-AB-002 | Hide the banner via session options, merchant CSS, logo upload, URL params | Impossible: no such option exists; merchant branding can't cover it | P0 | SEC |
| PS-AB-003 | Merchant name like a real bank or brand ("HBL Payments", "Meezan Bank", "JazzCash") | Blocked or flagged for review | P2 | API |
| PS-AB-004 | Checkout footer | "This is a test payment page. Never enter a real card." + report abuse link | P1 | E2E |
| PS-AB-005 | Many sessions from one merchant (e.g. 10,000/day) | Rate limited; flagged | P2 | API |

### P. Accessibility (WCAG 2.2 AA) · area `A11Y`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-A11Y-001 @smoke | axe-core on store, checkout (all states), dashboard, developers, webhooks | 0 serious/critical violations | P1 | A11Y |
| PS-A11Y-002 | Pay with keyboard only (Tab, Enter, Space) | Possible end to end, visible focus ring everywhere | P1 | M |
| PS-A11Y-003 | Every input | Has a visible label tied to it (`for`/`id` or `aria-label`) | P1 | A11Y |
| PS-A11Y-004 | Errors (declines, refused card, refund too large) | Announced by screen reader (`role="alert"` / `aria-live`) | P1 | A11Y |
| PS-A11Y-005 | Status badges | Text label, not colour alone | P1 | M |
| PS-A11Y-006 | Zoom 200% / 320 px wide | No horizontal page scroll, nothing cut off | P1 | E2E |
| PS-A11Y-007 | Tap targets | At least 24×24 px (WCAG 2.2, 2.5.8) | P2 | M |
| PS-A11Y-008 | Scrollable tables and code blocks | Reachable and scrollable by keyboard (`tabindex="0"` + label) | P2 | A11Y |

### P2. Guest demo sandbox · area `DEMO`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-DEMO-001 @smoke | First visit to `/demo` | Guest sandbox created with seeded payments; guest cookie is `HttpOnly`, `Secure`, signed | P0 | E2E |
| PS-DEMO-002 @smoke | Visitor A's cookie used to open visitor B's payment URL | 404; guests only ever see their own sandbox | P0 | E2E, SEC |
| PS-DEMO-003 | Tampered or forged guest cookie | Rejected; new sandbox offered | P0 | SEC |
| PS-DEMO-004 | Full loop in a guest sandbox: store → checkout → OTP → back → refund → dispute | All steps work; webhooks arrive at the built-in receiver and verify | P0 | E2E |
| PS-DEMO-005 | Receiver toggle set to "fail" | Deliveries return 500 and retries show in the log | P1 | E2E |
| PS-DEMO-006 | Guest tries the example API keys | 401 "sign up for real keys" | P0 | API |
| PS-DEMO-007 | Guest tries to set an external webhook URL | Not possible (field hidden, API refuses) | P1 | E2E, API |
| PS-DEMO-008 | 6th sandbox from one IP in a day / 201st overall | Refused with a friendly message | P2 | API |
| PS-DEMO-009 | Sandbox older than 24 h | Deleted by the daily cleanup with all its data; cookie then starts a fresh one | P1 | API |

### Q. Performance and reliability · area `PERF`

| ID | Scenario | Expected result | Pri | Level |
|---|---|---|---|---|
| PS-PERF-001 | Checkout on throttled 4G, mid-range phone | LCP < 2.5 s, INP < 200 ms, CLS < 0.1 | P1 | PERF |
| PS-PERF-002 | Checkout JS size | < 80 KB gzip | P2 | PERF |
| PS-PERF-003 | Create session API, 100 virtual users, 2 min | p95 < 500 ms, 0 errors | P2 | PERF |
| PS-PERF-004 | Neon cold start (DB asleep on free tier) | First request still succeeds within 5 s; no lost payment | P1 | PERF |
| PS-PERF-005 | DB unavailable during pay | Customer sees "try again"; no half-written payment; idempotent retry works | P1 | API |

### R. Browser / device matrix · area `BR`

Run PS-CO-001, PS-CO-003, PS-3DS-001, PS-RD-001, PS-CG-002 on:

| Browser | Desktop | Mobile |
|---|---|---|
| Chrome (Chromium) | ✓ | Android (Pixel 7 viewport) |
| Safari (WebKit) | ✓ | iPhone 14 viewport |
| Firefox | ✓ | none |
| Edge | smoke only | none |

---

## 7. Process

**Entry criteria (start testing a build):** builds, unit tests green, preview URL deployed, Neon branch seeded with test merchants A and B.

**Exit criteria (release v1):**
- 100% of P0 pass, ≥ 95% of P1 pass, no open S1/S2 bugs.
- Line coverage ≥ 90% on `lib/card-guard`, `lib/money`, `lib/state-machine`, `lib/webhooks/sign`, `lib/idempotency` (100% branch coverage on card-guard).
- axe: 0 serious/critical. ZAP: 0 high.

**Defect severity:**
| Severity | Meaning | Example |
|---|---|---|
| S1 Critical | Safety or money broken, data leak | Real card number reaches the server; merchant B sees merchant A's payments; banner can be hidden |
| S2 Major | Core flow broken, no workaround | Webhooks never retried; refunds exceed amount |
| S3 Minor | Flow works with a workaround | Wrong count on a filter chip |
| S4 Trivial | Cosmetic | Typo, spacing |

**Bug report fields:** ID · title · severity · environment (preview URL + commit) · steps · expected · actual · test case ID · screenshot / Playwright trace.

**CI gates (GitHub Actions, free):** PR → lint, typecheck, unit, component, API, axe, E2E @smoke. Nightly → full E2E + browser matrix. Weekly → ZAP, `npm audit`, gitleaks. Before release → Lighthouse CI, k6, manual keyboard + screen reader pass.

**Risks:**
- **R1:** a mistake in the card guard lets a real number through. *Mitigation:* guard on both client and server (PS-CG-012), unit tests at 100% branch coverage, and a weekly log scan.
- **R2:** Vercel's free (Hobby) cron can't run every minute, so the retry schedule needs a free queue (e.g. Upstash QStash free tier). PS-WH-008 depends on this choice.
- **R3:** Neon free-tier cold starts. Covered by PS-PERF-004.

---

## 8. QA findings on the current mockup (run 2026-11-11 in the browser pane)

| # | Finding | Sev | Becomes test |
|---|---|---|---|
| 1 | ~~Pay works with empty email, no CVC and expiry `01 / 20`~~ **Fixed:** email, expiry (MM / YY, not past, month 01–12, ≤ 20 years), 3-digit CVC and name are checked; errors show under each field and focus jumps to the first one | S2 | PS-FV-001…007 |
| 2 | ~~Card number field has no label; refusal not announced~~ **Fixed:** `label for`, `aria-describedby`, `aria-live="assertive"` on the message | S3 | PS-A11Y-003/004, PS-CG-015 |
| 3 | ~~Contrast 4.24:1 on the yellow badge~~ **Fixed:** darker text colour | S3 | PS-A11Y-001 |
| 4 | ~~Contrast 4.08:1 on grey store text~~ **Fixed** | S4 | PS-A11Y-001 |
| 5 | ~~Scrolling tables / code blocks not keyboard-reachable~~ **Fixed:** `tabindex="0"` + label, visible focus ring | S3 | PS-A11Y-008 |
| 6 | ~~"Send a test event" select has no label~~ **Fixed** | S3 | PS-A11Y-003 |
| 7 | ~~OTP dialog: no focus trap, Esc does nothing~~ **Fixed:** focus starts in the code box, Tab stays inside, Esc cancels, Enter verifies, focus moves to the result heading | S3 | PS-3DS-007 |
| 8 | ~~Webhook header is Stripe-style, not Standard Webhooks~~ **Fixed 2026-11-11:** mockup now sends Standard Webhooks headers | none | PS-WH-001, 016, 017 |

**Re-check 2026-11-11 after fixes:** axe-core (WCAG 2.0/2.1/2.2 A + AA) reports **0 violations** on all 13 views, including the OTP dialog and the refund form; all validation and keyboard checks pass.

Everything else (all test-card outcomes, real-card refusal, OTP, partial refund, dispute win/lose, webhook retries, redirect flow) passed.
