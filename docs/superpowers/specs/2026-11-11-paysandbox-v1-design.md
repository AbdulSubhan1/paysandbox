# PaySandbox v1: design

Status: draft for Abdul's review · 2026-11-11
Companion docs (same folder): `index.html` (clickable mockup) · `COMPONENTS.md` (UI parts) · `TEST-PLAN.md` (146 test cases).
Items marked **[my call]** were decided by Claude while writing this, not by Abdul. Change any of them freely.

---

## 1. Why this exists

Stripe isn't available in Pakistan, so local developers can't show a complete, realistic payment flow in a portfolio project or an MVP. PaySandbox is a **fake payment gateway offered as a product**: a developer creates an account, gets test API keys, sends customers to a hosted checkout page, receives signed webhooks and manages refunds and disputes in a dashboard, the same way they would with Stripe in test mode. **No real money ever moves, and only PaySandbox's own test card numbers work.**

It is also Abdul's portfolio piece. It should show payments depth, the things that separate a real payments engineer from a tutorial: payment state machine, idempotency, signed webhooks with retries, partial refunds, disputes, and safe handling of card-like data.

**Success looks like:**
1. A developer with a Next.js site can go from sign-up to a working test payment with a verified webhook in **under 15 minutes**, using only the docs page.
2. Abdul can demo the whole loop live in an interview: store → checkout → OTP → webhook → refund → dispute.
3. The code and test suite stand up to a senior reviewer reading the repo.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- **Invite-only sign-up** with GitHub (Abdul decided, 2026-11-11): Abdul is the admin and adds GitHub usernames to an allowlist. One user can own **up to 3 merchant accounts ("projects")**, each with its own keys and one webhook endpoint, so Abdul can plug PaySandbox into several of his own projects **[my call]**.
- **Throwaway demo sandbox** (Abdul decided): any visitor can try the full loop, including refunds and disputes, in a private sandbox with no login, deleted after 24 h.
- REST API: create checkout session, read payment, create refund, list payments. Idempotency on every POST.
- Hosted checkout page on PaySandbox's own URL: test cards, all outcomes, 3-D Secure OTP, permanent TEST MODE banner.
- Webhooks per the **Standard Webhooks** spec, with retries and a delivery log.
- Merchant dashboard: overview totals, payments list and detail with timeline, refunds (full and partial), simulated disputes, customers, test-card catalogue, developers page (keys, snippets, webhooks, API request log).
- `@paysandbox/react`: one small checkout button component on npm.
- The test suite in `TEST-PLAN.md` (P0 and @smoke cases at least) running in CI.

**Non-goals (not in v1)**
- Live mode, real money, real cards, bank connections. Ever.
- Currencies other than PKR.
- Embedded card fields inside the merchant's own page (iframe / Elements style). The hosted page is the only way to pay.
- Open public sign-up (v1 is invite-only; the allowlist can be dropped later).
- Subscriptions, saved cards, payouts, invoices, team members, multiple webhook endpoints per merchant, restricted keys.
- `@paysandbox/node` SDK (plain `fetch` + the `standardwebhooks` library is enough for v1).
- Email notifications (failing webhook endpoints show a dashboard banner instead).
- Merchant logo upload or custom checkout branding.

**Anti-goals (would make it a failure even if it works)**
- A real card number ever reaching our server, logs, database or any third-party service.
- Anyone being able to use the checkout to phish: hide the banner, frame the page, or make it look like a real bank or wallet.
- A merchant seeing another merchant's data.
- Any running cost. Everything stays on free tiers.

## 3. Constraints

- **Stack (Abdul's choice):** Next.js (App Router) + TypeScript + Tailwind, data in **Neon Postgres**.
- **Free tiers only:** Vercel Hobby, Neon Free, Upstash QStash Free, GitHub (public repo), npm (public package). Usage caps in §7a keep one merchant from using up a free tier.
- **Accounts:** personal only. GitHub `AbdulSubhan1`, Abdul's own Vercel.
- **Card safety:** the checkout accepts only PaySandbox test cards and refuses everything else in the browser, before sending (see §7).
- **TEST MODE banner:** always visible on every checkout state; merchants have no way to remove or cover it.
- **Payment flow:** the customer leaves the merchant's site and pays on PaySandbox's own URL, then is redirected back. Same tab, like Tabby and Stripe Checkout (decided with Abdul).
- **Webhooks:** Standard Webhooks spec (decided with Abdul).
- **UI:** shadcn/ui components on Tailwind, look and feel from the mockup (sand / ink / green, IBM Plex). Component list in `COMPONENTS.md`.

## 4. Architecture

```
 Merchant's site (e.g. my-store.vercel.app)          PaySandbox (one Next.js app on Vercel)
 ┌──────────────────────────────┐   sk_test_   ┌───────────────────────────────────────────┐
 │ server route                 │ ───────────▶ │ /api/v1/*        public REST API          │
 │  POST /v1/checkout_sessions  │ ◀─────────── │   (API-key auth, idempotency, rate limit) │
 │                              │   {url}      │                                           │
 │ browser ──redirect──────────────────────────▶ /c/[sessionId]   hosted checkout page     │
 │        ◀──redirect to success_url / cancel_url  (TEST MODE banner, card guard, OTP)     │
 │                              │              │                                           │
 │ /api/webhooks/paysandbox ◀──────────────────── webhook worker  (Standard Webhooks)      │
 │   (verifies with standardwebhooks lib)      │   attempts scheduled via Upstash QStash   │
 └──────────────────────────────┘              │                                           │
                                               │ /dashboard/*     merchant dashboard        │
                                               │   (GitHub login, server components)        │
                                               └───────────────┬───────────────────────────┘
                                                               │ Drizzle ORM
                                                     Neon Postgres (free)  ·  Upstash QStash (timed jobs)
```

- **One Next.js app [my call].** Checkout lives at `/c/[sessionId]` on the same Vercel domain as the dashboard. A separate origin (e.g. `checkout.paysandbox.dev`) needs a paid domain; revisit if Abdul buys one. The checkout route gets its own strict headers (§7).
- **URL:** `https://paysandbox.vercel.app` if the project name is free on Vercel, otherwise the closest available name.
- **ORM:** Drizzle with the Neon serverless driver **[my call]** (small, SQL-like, works on Vercel functions without connection pooling problems).
- **Auth for the dashboard:** Better Auth with **GitHub login only** **[my call]**: the audience is developers, it's free, and there are no passwords to store or reset. After GitHub login, a user not on the allowlist sees "PaySandbox is invite-only for now" with a request-access link (`mailto:`), and no account is created. Abdul's GitHub user ID is set as admin in an env var, so he is always allowed.
- **Guest sandboxes** (no login) are tied to a signed, `HttpOnly` cookie that holds only the guest merchant ID. That cookie opens that one guest merchant and nothing else.
- **Webhook scheduling:** Upstash **QStash** free tier **[my call]**. Vercel Hobby cron runs at most once a day, which can't do 1-minute retries. Each delivery attempt is one QStash message with a delay; QStash calls back `/api/internal/deliver` (verified with QStash's own signature).
- **Usage caps** are counted in Postgres (`usage_daily`), not Redis, so there is one less free tier to run out **[my call]**. See §7a.
- **Dashboard reads the DB directly** in server components. Only third parties use the public REST API.

## 5. Data model (Postgres)

All money is stored as **integer paisa** (`bigint`). All IDs are `prefix_` + 24 random base62 characters. Every merchant-owned table has `merchant_id`, and every query filters by it.

| Table | Key columns |
|---|---|
| `users` | `id` (`usr_`), `github_user_id`, `github_login`, `is_admin`, `created_at` |
| `signup_allowlist` | `github_login` (primary key), `added_by`, `created_at` |
| `merchants` | `id` (`mer_`), `owner_user_id` (null for guests), `name`, `is_guest`, `guest_expires_at`, `demo_receiver_mode` (`ok` / `fail`, guests only), `created_at`. Max 3 non-guest merchants per user. |
| `api_keys` | `id`, `merchant_id`, `type` (`publishable` / `secret`), `prefix` (`pk_test_` / `sk_test_`), `last4`, `key_hash` (SHA-256, secret keys only), `publishable_value` (publishable only), `expires_at` (set on roll: old key + 24 h), `created_at` |
| `checkout_sessions` | `id` (`cs_test_`), `merchant_id`, `amount`, `currency` (`pkr`), `line_items` (jsonb), `customer_email` (optional prefill), `success_url`, `cancel_url`, `status` (`open` / `complete` / `expired`), `expires_at` (+24 h), `payment_id`, `idempotency_key`, `created_at` |
| `payments` | `id` (`pay_`), `merchant_id`, `checkout_session_id`, `customer_id`, `amount`, `amount_refunded`, `status`, `card_brand`, `card_last4`, `test_card` (which catalogue entry), `failure_code`, `decline_code`, `otp_attempts`, `created_at` |
| `payment_activity` | `id`, `payment_id`, `kind`, `message`, `detail` (jsonb), `created_at` (the dashboard timeline) |
| `refunds` | `id` (`re_`), `merchant_id`, `payment_id`, `amount`, `reason`, `status`, `created_at` |
| `disputes` | `id` (`dp_`), `merchant_id`, `payment_id`, `amount`, `reason`, `status` (`needs_response` / `won` / `lost`), `previous_payment_status`, `respond_by`, `created_at`, `closed_at` |
| `customers` | `id` (`cus_`), `merchant_id`, `email` (unique per merchant), `name`, `created_at` |
| `webhook_endpoints` | `id` (`we_`), `merchant_id`, `url`, `secret_encrypted`, `previous_secret_encrypted` + `previous_secret_expires_at` (roll), `enabled`, `consecutive_failures`, `disabled_reason` |
| `events` | `id` (`evt_`), `merchant_id`, `type`, `payload` (jsonb snapshot), `created_at` |
| `webhook_deliveries` | `id`, `event_id`, `endpoint_id`, `attempt`, `status_code` (null = timeout / network error), `duration_ms`, `response_snippet` (first 1 KB), `attempted_at`, `next_attempt_at`, `state` (`pending` / `delivered` / `failed`) |
| `idempotency_keys` | `merchant_id` + `key` (primary key), `request_hash`, `status` (`in_progress` / `done`), `response_status`, `response_body`, `created_at` (rows older than 24 h ignored and purged) |
| `usage_daily` | `merchant_id` + `day` (primary key), `api_requests`, `checkout_sessions`, `webhook_attempts`, `test_events` (one upsert per counted action) |
| `api_request_log` | `id`, `merchant_id`, `method`, `path`, `status`, `idempotency_key`, `error_code`, `duration_ms`, `created_at`. **No request or response bodies.** |

**What is never stored:** full card numbers (even test ones: only brand, last 4 and which test card), expiry, CVC, OTP codes, full secret API keys.

**Cleanup:** a daily Vercel cron (allowed on Hobby) deletes guest merchants past `guest_expires_at` (with all their data), data older than **90 days [my call]**, and expired idempotency keys, to stay inside Neon's free storage.

## 6. Payment flow and states

```
session open ──pay──▶ processing ──▶ succeeded ──refund (part)──▶ partially_refunded ──refund (rest)──▶ refunded
                         │  │            │   ▲                            │
                         │  │            │   └──── dispute won ◀──┐       │
                         │  │            └──dispute──▶ disputed ───┤◀──────┘
                         │  │                                     └── dispute lost ──▶ dispute_lost
                         │  └──▶ failed  (decline codes)
                         └──▶ requires_action ──OTP 123456──▶ succeeded
                                        └──wrong OTP ×3 / cancel / session expiry──▶ failed (authentication_failed)
```

1. **Create session.** Merchant server: `POST /api/v1/checkout_sessions` with `sk_test_`, `Idempotency-Key`, `amount` (paisa, integer, PKR 1 to PKR 1,000,000 **[my call]**), `currency=pkr`, `line_items` (max 20), `success_url`, `cancel_url` (https, or `http://localhost` for local dev), optional `customer_email`. Response includes `url`.
2. **Redirect.** Merchant sends the browser to `url` (`/c/cs_test_…`).
3. **Checkout page** (server-rendered): order summary, TEST MODE banner, card form, test-card picker. Paid session → "already paid" page with a link to `success_url`. Expired → "expired" page with a link to `cancel_url`.
4. **Pay.** Browser `POST /c/[id]/pay` with `{ email, name, card_number, exp_month, exp_year }`. **CVC is checked in the browser and never sent [my call].** Server checks: card number is in the test catalogue (else 400 `card_not_test_card`, nothing logged); expiry valid; session open. One payment per session at a time (row lock). Outcome by test card (table in `TEST-PLAN.md` §5). A short artificial delay (~800 ms) makes "Processing…" visible.
5. **OTP (card 3220).** Response `requires_action` → browser shows the "Sandbox Bank" dialog (on our page, clearly labelled as a simulation). `POST /c/[id]/otp`. `123456` → succeeded; 3 wrong codes or cancel → failed.
6. **Result.** Success → success screen, then the customer clicks to return to `success_url?pay=pay_…`. Decline → error screen with codes and "Try another card" (new payment on the same session; the failed one stays in history).
7. **Expiry.** Sessions expire 24 h after creation. When a session is created, one delayed QStash message is scheduled for `expires_at`; when it fires, an `open` session becomes `expired` and any `requires_action` payment on it becomes `failed` (`authentication_failed`) and sends `payment.failed`, so merchants get the event on time **[my call]**. Reads also treat a past `expires_at` as expired, as a safety net if a message is late, but **reads never write or send events**.
8. **Dispute card (0259).** Payment succeeds; a QStash message 60 s later opens a dispute.
9. **Refunds** (API or dashboard): amount ≤ amount left; allowed on `succeeded` / `partially_refunded` only; not while a dispute is open. Done in one transaction with a row lock so parallel refunds can't overspend.
10. **Disputes** (dashboard "Simulate dispute" or card 0259): amount = amount left; respond-by = +7 days; merchant picks win (status goes back) or lose (`dispute_lost`). **If respond-by passes with no answer, the dispute is lost automatically** (Stripe behaves the same), triggered by a delayed QStash message scheduled when the dispute opens, and `dispute.closed` is sent **[my call]**. Disputes are dashboard-only in v1 (no API).

**Events emitted:** `payment.succeeded`, `payment.failed`, `payment.requires_action`, `refund.created`, `dispute.created`, `dispute.closed`. Payload = snapshot of the object at that moment, amounts in paisa, `livemode: false`.

## 7. Safety and abuse prevention

**Card guard (both sides).**
- *Browser:* `CardNumberInput` accepts a digit only if the digits so far are the start of a test card number. As soon as 4 digits don't match, the field is cleared and a message is announced. The refused digits are never put in React state, analytics or any request.
- *Server:* the pay endpoint rejects any number not in the catalogue. The request body for that route is never logged (no body logging anywhere; error tracking scrubs `card_number`).
- The catalogue lives in one shared module used by both sides, with 100% branch test coverage.

**Checkout page headers:** `Content-Security-Policy` with `frame-ancestors 'none'` (nobody can frame and crop the page), `X-Frame-Options: DENY`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`.

**Banner:** rendered by the server layout of `/c/*`, outside any merchant-controlled content; no API field or query param can affect it. Footer: "This is a test payment page. Never enter a real card." plus a report-abuse link (`mailto:` Abdul's email).

**Merchant names:** 2–40 characters, plain text, shown escaped. A small blocklist of real Pakistani bank and wallet names (HBL, UBL, Meezan, JazzCash, Easypaisa, …) is refused **[my call]**.

**API:** secret keys hashed (SHA-256) and shown **once** at creation and roll **[my call; the mockup shows a Reveal button, which would need the key stored reversibly]**. Publishable keys can't call anything except the checkout page. Wrong-merchant IDs return 404. Usage caps in §7a.

**Webhook endpoint URLs:** https only. Our servers can't reach a developer's `localhost`, so local development uses a tunnel (e.g. ngrok); the docs explain this. Before saving and before every send, the hostname is resolved and refused if it points to a private, loopback, link-local or metadata address (SSRF). 10 s timeout, redirects not followed, response read up to 64 KB.

**Webhook signing secret:** `whsec_` + base64 of 24 random bytes, stored encrypted (AES-256-GCM, key in a Vercel env var). Revealable in the dashboard (needed to configure receivers).

## 7a. Usage caps (keep the free tiers alive) [my call]

One script on one key must not be able to use up a month of Vercel, Neon or QStash allowance. Per merchant, per calendar day (Pakistan time):

| Counted | Cap | Over the cap |
|---|---|---|
| API requests | 1,000 | 429 `daily_limit_reached`, `Retry-After` = seconds to midnight |
| Checkout sessions created | 200 | same |
| Webhook delivery attempts (incl. retries) | 500 | further deliveries wait until the next day |
| "Send test event" | 50 | button disabled with a message |

- Requests refused for the cap are counted but **not** written to `api_request_log`, so abuse can't fill the database.
- Developers page shows today's usage against each cap.
- Caps are per merchant, so one merchant's busy day never blocks another; an interview demo in a fresh guest sandbox always starts with a full allowance.
- Guest sandboxes: at most 5 created per IP address per day and 200 in total per day; each guest gets half the caps above.
- A global switch (env var) pauses new sign-ups and new sessions if the free tiers get close to their limits.
- Builder checks the current free quotas of Vercel Hobby, Neon and QStash before launch and lowers the caps if needed.

## 8. Webhooks (Standard Webhooks)

- Headers: `webhook-id` (= event ID, same on every retry), `webhook-timestamp` (unix seconds), `webhook-signature` (`v1,<base64 HMAC-SHA256 of "id.timestamp.body">`).
- Secret roll: for 24 h the header carries two signatures (old and new, space-separated).
- Delivery is at least once; order is not guaranteed. Docs tell receivers to de-duplicate on `webhook-id`.
- **Schedule [my call, same as mockup]:** attempt 1 immediately, then 1 min, 5 min, 30 min, 2 h, 6 h after the previous one; after attempt 6 fails, the delivery is `failed`.
- 2xx = delivered. Anything else, timeout or network error = failed attempt.
- After **20 consecutive failed events [my call]** the endpoint is disabled and the dashboard shows a banner with a "re-enable" button.
- Dashboard: event log, request we sent (headers + body), every attempt with status and time, "Resend now", "Send test event".
- QStash messages are used for delivery attempts, session expiry and dispute deadlines; the caps in §7a bound how many a merchant can trigger in a day.

## 9. Public API (v1)

Base path `/api/v1`, JSON, HTTP Basic or Bearer with `sk_test_…`.

| Method | Path | Notes |
|---|---|---|
| POST | `/checkout_sessions` | idempotent |
| GET | `/checkout_sessions/{id}` | |
| GET | `/payments` | list, newest first, cursor pagination (`starting_after`, `limit` ≤ 100) |
| GET | `/payments/{id}` | |
| POST | `/refunds` | `{ payment, amount?, reason }`; idempotent; amount defaults to the amount left |
| GET | `/events/{id}` | for receivers that want to re-fetch |

**Errors:** `{ "error": { "type", "code", "message", "param" } }`, Stripe-shaped.
**Idempotency (IETF draft):** keys kept 24 h per merchant; replay returns the stored status and body with `Idempotent-Replayed: true`; same key + different body → 422; same key while the first request is still running → 409; 5xx responses are not stored, so retries re-run.
**Spec:** an OpenAPI 3.1 file in the repo is the source of truth; responses are checked against it in CI; the docs page renders from it.

## 10. Dashboard and developer experience

Pages match the mockup: Overview, Payments (+ detail), Customers, Disputes, Test cards, API keys & code, Webhooks (+ event detail), API request log. Components and reuse rules: `COMPONENTS.md`.

**Docs:** a public `/docs` page with a quick start (create keys → create session → redirect → verify webhook) and the snippets from the mockup (React button, Next.js server route, curl, webhook verify). Snippets are compiled and run against preview in CI so they can't go stale.

**`@paysandbox/react`:** `<PaySandboxButton createSession={…}>`: calls the merchant's own server route, then redirects to the returned URL. No Tailwind, no shadcn, inline styles, < 5 KB gzip, published from the same repo (`packages/react`).

**Demo store and guest sandbox** (Abdul decided: each visitor gets their own throwaway sandbox):
- `/demo` creates a guest merchant on the first visit (seeded with ~10 sample payments in every status, like the mockup) and sets the guest cookie. "Start a fresh sandbox" replaces it.
- The visitor shops in the demo store ("Chai Code Co."), pays on the real hosted checkout `/c/…`, is redirected back to `/demo/thanks`, then opens **their own** dashboard to refund, dispute and inspect webhooks.
- A banner on every guest page: "Demo sandbox, deleted in 23 h. Invite-only for real accounts."
- **Webhooks for guests** go to a built-in receiver (`/api/demo-receiver/[merchantId]`) that verifies the Standard Webhooks signature and records it, so the visitor sees signed deliveries arrive. A toggle makes the receiver return 500, so they can watch retries happen. Guests can't set an external webhook URL.
- **Guests get no working API keys.** The developers page shows example keys marked "sign up for real keys", so the invite-only rule can't be bypassed through the demo. Sessions for the demo store are created by PaySandbox's own server code.
- Guest sandboxes expire 24 h after creation, so an interview can't be wiped mid-demo unless the sandbox is already a day old.

## 11. Testing and CI

`TEST-PLAN.md` is the plan. For v1: all **P0** and **@smoke** cases automated; P1 automated where cheap, otherwise manual before release. CI on GitHub Actions (free for a public repo): lint, typecheck, unit, API tests against a per-run Neon branch, Playwright smoke, axe. Nightly full E2E. Coverage gate: 100% branch on the card guard; 90% lines on money, state machine, signing, idempotency.

## 12. Repo layout

```
paysandbox/                    (new public repo: AbdulSubhan1/paysandbox)
  apps/web/                    Next.js app: /c, /dashboard, /docs, /demo, /api
    src/lib/card-guard/        shared test-card catalogue + guard (client + server)
    src/lib/money/  state/  webhooks/  idempotency/  db/
  packages/react/              @paysandbox/react
  openapi.yaml
  docs/superpowers/specs/      this design (moved here when the repo exists)
  e2e/                         Playwright
```
pnpm workspaces **[my call]**; no Turborepo needed at this size.

## 13. Build order

1. Repo, CI skeleton, Neon + Drizzle schema, GitHub login, merchant + keys.
2. Card guard module (test-first) and hosted checkout with all outcomes + OTP.
3. Public API: sessions, payments, idempotency, rate limits, API log, OpenAPI.
4. Webhooks: signing, QStash delivery, retries, SSRF guard, dashboard log.
5. Dashboard: overview, payments, detail timeline, refunds, disputes, customers.
6. Docs page, demo store, `@paysandbox/react` on npm.
7. Full test pass against `TEST-PLAN.md`, security headers, axe, Lighthouse, release.

## 13a. Which document wins

Where `COMPONENTS.md` or `TEST-PLAN.md` disagree with this design, **this design wins**. Both were updated on 2026-11-11 to match it: one domain (`/c/*` and `/dashboard/*`), secret key shown once, endpoint disabled after 20 consecutive failed events with a dashboard banner (no email), amount max PKR 1,000,000, 20 line items max, daily caps instead of per-second limits, timed expiry and dispute deadlines.

## 14. Left to the builder

Exact component APIs, folder names inside `src/`, Drizzle migration style, error messages wording, loading states, which Playwright cases are smoke beyond those tagged, the docs page layout, and anything not named above.

## 15. Decisions and open questions

**Decided by Abdul (2026-11-11):** hosted checkout on a separate URL with same-tab redirect; Standard Webhooks; invite-only sign-up; a throwaway sandbox per visitor; Abdul can use PaySandbox for his own projects.

**Open:** none blocking. Everything marked **[my call]** is Claude's default and can be changed before the build plan is written.
