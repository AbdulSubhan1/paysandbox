# PaySandbox Plan 4: Demo Sandbox, Docs and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone (an interviewer) can open `/demo`, get a private throwaway sandbox with sample payments, buy from the demo store on the real checkout, then refund, dispute and watch signed webhooks arrive at a built-in receiver, all without an account. Developers get a public `/docs` page whose snippets are run in CI. Abdul gets an admin page for the invite allowlist. Old data is cleaned up daily. The release checks run (headers on every route, gitleaks, ZAP, Lighthouse, k6), and the test plan is reported against the real tests. Release `v1.0.0`.

**Architecture:** A guest sandbox is a normal `merchants` row with `is_guest = true`, `owner_user_id = null` and `guest_expires_at = +24 h`. It is opened by a signed, `HttpOnly` cookie that holds only its ID. `requireProject` learns a second way in: the guest cookie, for that one merchant. Guest sandboxes have no API keys. Their webhook endpoint is fixed to the built-in receiver `/api/demo-receiver/[merchantId]`, which verifies the Standard Webhooks signature with the endpoint's secret and records the result. The daily cron also deletes expired guests and old data. Release checks run in a separate weekly / manual workflow, so PR CI stays fast.

**Tech Stack:** As Plans 1–3. New in CI only: `gitleaks/gitleaks-action`, `zaproxy/action-baseline`, `treosh/lighthouse-ci-action`, `grafana/setup-k6-action` (each pinned to a release ≥ 2 weeks old). No new app dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-paysandbox-v1-design.md` §4 (guests), §5 (cleanup), §7 (abuse, banner), §7a (guest caps, global switch), §10 (docs, demo), §11; test cases `PS-DEMO-*`, `PS-DEV-001/004`, `PS-SEC-002/005/006`, `PS-AB-005`, `PS-PERF-001..003`, `PS-A11Y-001/006` in `…-test-plan.md`.

## Global Constraints

Plans 1–3 Global Constraints still apply. In addition:

- **No npm package** (Abdul, 2026-11-11: PaySandbox is internal). `@paysandbox/react`, PS-DEV-002 and COMPONENTS.md's `PaySandboxButton` are out of scope; docs use plain `fetch` plus a redirect.
- Guest cookie `ps_guest`: value `<merchantId>.<HMAC-SHA256 base64url of merchantId with key derived from BETTER_AUTH_SECRET>`, `HttpOnly`, `Secure` (except in E2E mode over http), `SameSite=Lax`, `Path=/`, `Max-Age` = seconds until `guest_expires_at`. A bad signature, an unknown ID or an expired sandbox counts as no cookie (PS-DEMO-003).
- Guest sandbox: name "Chai Code Co.", `guest_expires_at` = created + 24 h; seeded with 10 payments covering every status (succeeded ×3, partially_refunded, refunded, failed ×2, requires_action, disputed, dispute_lost) with matching activity, refunds, disputes and events. The webhook endpoint points at `${APP_URL}/api/demo-receiver/<id>`; `demo_receiver_mode` = `ok`.
- Guest limits: at most **5 sandboxes per IP per Pakistan day** and **200 in total per day**; the IP is stored only as a SHA-256 hash. Each guest gets **half** of every daily cap (rounded down).
- Guest banner on every guest page, exactly: `Demo sandbox, deleted in {N} h. Invite-only for real accounts.` (N = whole hours left, at least 1).
- Guests can't use API keys: none are created. The Developers page shows example keys labelled "Sign up for real keys". Guests can't set an external webhook URL; they can only toggle the receiver between "Return 200" and "Return 500".
- Global switch: env `PAYSANDBOX_PAUSED=1` refuses new sign-ups, new guest sandboxes and new checkout sessions (API `503` `service_paused`), with a friendly message. Existing checkouts still work.
- Cleanup, daily, in the existing cron: delete guest merchants past `guest_expires_at` (cascade), plus `events`, `webhook_*`, `api_request_log`, `payment_activity`, `jobs` (done) and `usage_daily` rows older than **90 days**, and `idempotency_keys` older than 24 h.
- Security headers on **every** route: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (checkout keeps `strict-origin`), `X-Frame-Options: DENY` and `frame-ancestors 'none'` on `/c/*`, `/dashboard/*`, `/demo/*`, `/admin/*`.
- Admin page `/admin` only for `users.is_admin`; everyone else gets the 404 page.
- **Testing rule (Abdul):** unit and component tests per task; Playwright once, in Task 11; don't watch CI after pushing.

**Plan calls:**
1. The demo receiver records into a new `demo_receipts` table (`merchantId`, `webhookId`, `type`, `verified`, `status` returned, `receivedAt`). The Webhooks page for guests shows these "Received by the demo receiver" rows above the event log.
2. The docs snippets live in one module (`lib/docs/snippets.ts`), used by `/docs` and the Developers page. The `curl` snippet is run by an E2E test; the webhook-verify snippet is a real TypeScript file (`apps/web/examples/verify-webhook.ts`), typechecked and unit-tested against a real signed payload.
3. ZAP, Lighthouse and k6 run against `next start` inside the workflow (not production), weekly and on demand; their reports are uploaded as artifacts.
4. The test-plan report is generated: a script finds every `PS-…` ID in test names and writes `docs/test-plan-coverage.md` (covered by → test file; not automated → listed for a manual pass).

## Review Focus

1. **Visitor A's guest cookie sent with visitor B's sandbox URLs** (dashboard, payment, event, receiver toggle). Expected: the 404 page, no data. Test in Task 2.
2. **The demo receiver called by anyone with a guessed merchant ID and a forged signature.** Expected: recorded as `verified: false`, never as a real delivery; the toggle can't be flipped by POSTing to the receiver. Test in Task 3.
3. **A guest sandbox expiring while the visitor is on the page.** Expected: their next action gets "This demo sandbox has expired" with a "Start a fresh sandbox" link, not a crash; the cleanup deletes every row of it and nothing of anyone else's. Test in Task 5.
4. **Many visitors behind one IP (an office, a mobile carrier).** Expected: the 6th sandbox of the day is refused with a friendly message; existing sandboxes keep working. Test in Task 1.
5. **A real merchant hitting `PAYSANDBOX_PAUSED`.** Expected: existing checkouts still complete and webhooks still deliver; only new sessions, sign-ups and sandboxes are refused. Test in Task 4.

---

## File structure

```
apps/web/
  drizzle/0003_*.sql                                   # guest_creations, demo_receipts (Task 1, 3)
  examples/verify-webhook.ts                           # Task 6
  scripts/test-plan-report.mjs                         # Task 10
  perf/k6-create-session.js                            # Task 9
  lighthouserc.json  .zap/rules.tsv                    # Task 9
  src/lib/guests/cookie.ts  guests.ts  seed.ts  access.ts
  src/lib/demo/receiver.ts
  src/lib/docs/snippets.ts
  src/lib/cleanup/cleanup.ts
  src/lib/admin/allowlist.ts
  src/app/demo/page.tsx  demo/actions.ts  demo/thanks/page.tsx
  src/app/api/demo-receiver/[merchantId]/route.ts
  src/app/docs/page.tsx
  src/app/admin/page.tsx  admin/actions.ts
  src/components/dashboard/GuestBanner.tsx
  e2e/demo.spec.ts  e2e/docs-admin.spec.ts
.github/workflows/ci.yml (gitleaks job)  .github/workflows/release-checks.yml
docs/test-plan-coverage.md                            # generated, Task 10
```

---

### Task 1: Guest sandboxes: create, limit, seed, sign the cookie

**Files:**
- Create: `src/lib/guests/cookie.ts`, `src/lib/guests/guests.ts`, `src/lib/guests/seed.ts`; Modify: `src/lib/db/schema.ts` (+ `guestCreations`), `src/lib/api/usage.ts` (half caps for guests); migration `0003`
- Test: `src/lib/guests/cookie.test.ts`, `src/lib/guests/guests.test.ts`, `src/lib/api/usage.test.ts` (extend)

**Interfaces:**
- Produces:
  - `signGuestId(merchantId: string): string` and `readGuestCookie(raw: string | undefined): string | null` (constant-time compare; null on any tamper).
  - Table `guestCreations` with `day` and `ipHash` (primary key) and `count`. `GUEST_LIMITS = { perIpPerDay: 5, perDay: 200 }`.
  - `createGuestSandbox(db: Db, ip: string, now: Date): Promise<{ ok: true; merchant: Merchant } | { ok: false; reason: 'ip_limit' | 'daily_limit' | 'paused' }>`. It counts the IP and the day total atomically (an upsert, then a sum), creates the merchant and an endpoint pointing at the receiver, and seeds it (`seedGuestSandbox(db, merchantId, now)`).
  - `consumeUsage` and `countRequestForKey` use `capFor(counter, isGuest) = isGuest ? Math.floor(CAPS[counter] / 2) : CAPS[counter]`. `consumeUsage` reads `merchants.is_guest` itself.

- [ ] **Step 1: Write the failing tests:**
  - cookie: a round-trip; a changed ID, a changed signature, or a signature made with another secret → `null`.
  - **Review Focus 4 / PS-DEMO-008:** 5 sandboxes from one IP succeed, the 6th → `ip_limit`; another IP still works. With 200 already made today → `daily_limit`. The next Karachi day resets.
  - Seed: the new sandbox has 10 payments covering all 7 statuses, `getOverview` totals are consistent, and every seeded event exists. `guestExpiresAt` = now + 24 h. The endpoint URL ends `/api/demo-receiver/<id>`.
  - A guest's `test_events` cap is 25 and `checkout_sessions` is 100.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; derive the HMAC key as `HMAC(BETTER_AUTH_SECRET, 'ps_guest_v1')`.
- [ ] **Step 4:** Run, then `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(demo): guest sandboxes with limits, seed data and a signed cookie`.

---

### Task 2: Guests in the dashboard

**Files:**
- Modify: `src/lib/merchants/require-project.ts`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/[merchantId]/layout.tsx`, the Developers and Webhooks pages, `webhooks/actions.ts`
- Create: `src/components/dashboard/GuestBanner.tsx`
- Test: `src/lib/merchants/require-project.test.ts` (extend), `src/components/dashboard/GuestBanner.dom.test.tsx`

**Interfaces:**
- Produces:
  - `requireProject(merchantId)` returns `{ user: CurrentUser | null; merchant; projects; guest: boolean }`. It allows the signed-in owner, or a valid guest cookie for exactly this (non-expired, `is_guest`) merchant. Anything else → `notFound()`. An expired sandbox → `redirect('/demo?expired=1')`.
  - Guest mode in the UI:
    - the header shows `<GuestBanner hoursLeft />` instead of "@login", and no project switcher
    - Developers shows example keys (`pk_test_example…`, `sk_test_example…`) with "Sign up for real keys" and the invite note, with no roll
    - Webhooks has no URL field, a "Demo receiver: Return 200 / Return 500" toggle (`setDemoReceiverModeAction(merchantId, mode)`), and the "Received by the demo receiver" list
  - The webhook endpoint actions refuse guests (`{ ok: false, error: 'Demo sandboxes use the built-in receiver.' }`) (PS-DEMO-007).

- [ ] **Step 1: Write the failing tests:**
  - **Review Focus 1 / PS-DEMO-002:** a guest cookie for sandbox A opens A, and gets `notFound` for sandbox B and for any real project.
  - An expired sandbox → redirect to `/demo?expired=1`.
  - A forged cookie → `notFound` (PS-DEMO-003).
  - GuestBanner shows "Demo sandbox, deleted in 23 h. Invite-only for real accounts.", and "1 h" when 10 minutes are left.
  - `saveWebhookEndpointAction` with a guest returns the refusal message.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `requireProject` reads the cookie with `cookies()` (already inside Suspense).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(demo): guests use their own sandbox's dashboard`.

---

### Task 3: Demo store, thanks page and the built-in receiver

**Files:**
- Create: `src/app/demo/page.tsx`, `src/app/demo/actions.ts`, `src/app/demo/thanks/page.tsx`, `src/app/api/demo-receiver/[merchantId]/route.ts`, `src/lib/demo/receiver.ts`; schema `demoReceipts`
- Test: `src/lib/demo/receiver.test.ts`, `src/app/demo/demo.actions.test.ts`

**Interfaces:**
- Produces:
  - `/demo` (public):
    - **With a valid cookie:** the store (cart: Developer hoodie PKR 4,500 + Sticker pack ×2 PKR 300 = PKR 5,100), a Checkout button (server action), links "Open your dashboard" and "Start a fresh sandbox", and the banner.
    - **Without a cookie:** a "Start your demo sandbox" button that creates one.
    - `?expired=1` shows "Your demo sandbox expired."
    - Refusals (limits, pause) show their friendly message.
  - Actions:
    - `startSandboxAction()`: the IP comes from `x-forwarded-for` (first entry) or `x-real-ip`; it sets the cookie.
    - `freshSandboxAction()`: replaces the sandbox.
    - `demoCheckoutAction()`: `createCheckoutSession` for the guest merchant, with success `/demo/thanks`, then a redirect to the session URL. It works without API keys, and only for a valid guest.
  - `/demo/thanks?pay=…`: "Thank you, {first name}", the payment ID, and a link to the payment in the dashboard (only for the cookie's own sandbox, else a plain thank-you).
  - `POST /api/demo-receiver/[merchantId]`:
    - It looks up the guest merchant's endpoint and verifies the request with `new Webhook(secret).verify(body, headers)`.
    - It inserts a `demoReceipts` row (`verified`, `status`). It answers `500` when `demo_receiver_mode = 'fail'`, else `200`.
    - Unknown or real (non-guest) merchant → `404`.
    - The body is never stored beyond `type` and `webhookId`.
  - `recordDemoReceipt(db, merchantId, headers, body, now): Promise<{ status: 200 | 500 | 404; verified: boolean }>` in `lib/demo/receiver.ts`.

- [ ] **Step 1: Write the failing tests:**
  - A correctly signed body → `verified: true`, status 200, one row.
  - **Review Focus 2:** a forged signature → `verified: false`, still recorded with status 200, and no `demo_receiver_mode` change. A real merchant's ID → 404.
  - `mode = 'fail'` → 500 (PS-DEMO-005).
  - `demoCheckoutAction` without a cookie → refused; with one → a session for that guest merchant with the two line items.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(demo): demo store, thanks page and a verifying built-in webhook receiver`.

---

### Task 4: Global pause switch

**Files:**
- Create: `src/lib/pause.ts`; Modify: `src/lib/auth/auth.ts` (sign-up hook), `src/lib/sessions/sessions.ts`, `src/lib/guests/guests.ts`
- Test: `src/lib/pause.test.ts`, extend `src/lib/sessions/*.test.ts` and `src/lib/auth/auth.test.ts`

**Interfaces:**
- Produces:
  - `isPaused(): boolean` (`PAYSANDBOX_PAUSED === '1'`).
  - `createCheckoutSession` throws `ApiError(503, 'api_error', 'service_paused', 'PaySandbox is paused for new checkouts. Existing checkouts still work.')`.
  - The sign-up hook refuses.
  - `createGuestSandbox` returns `paused`.

- [ ] **Step 1: Write the failing tests (Review Focus 5):** with the env set:
  - creating a session → 503 `service_paused`
  - `payCheckoutSession` on an existing open session still succeeds, and its webhook is still enqueued
  - a new sign-up → refused
  - a new guest sandbox → `paused`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: PAYSANDBOX_PAUSED stops new sign-ups, sandboxes and sessions`.

---

### Task 5: Daily cleanup

**Files:**
- Create: `src/lib/cleanup/cleanup.ts`; Modify: `src/app/api/internal/cron/route.ts`
- Test: `src/lib/cleanup/cleanup.test.ts`

**Interfaces:**
- Produces: `runCleanup(db: Db, now: Date): Promise<{ guests: number; oldRows: number; idempotencyKeys: number }>`. It deletes expired guest merchants (the cascade removes their payments, events, jobs and receipts), rows older than 90 days in the tables named in the Global Constraints, and idempotency keys older than 24 h. The cron route calls it after the jobs and returns its counts.

- [ ] **Step 1: Write the failing tests:**
  - **Review Focus 3 / PS-DEMO-009:** an expired guest with seeded data has no rows left in any table that references it; a live guest and a real merchant are untouched.
  - A 91-day-old event is deleted, an 89-day-old one kept.
  - A real merchant's payments are never deleted by age (payments are kept).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with plain `DELETE … WHERE` statements, each in its own statement (no long transaction).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: daily cleanup of expired sandboxes and data older than 90 days`.

---

### Task 6: Public docs page with tested snippets

**Files:**
- Create: `src/lib/docs/snippets.ts`, `src/app/docs/page.tsx`, `apps/web/examples/verify-webhook.ts`; Modify: the Developers page (use the shared snippets; show the project's publishable key, fixing the Plan 3 minor); `tsconfig` include `examples`
- Test: `src/lib/docs/snippets.test.ts`, `apps/web/examples/verify-webhook.test.ts`

**Interfaces:**
- Produces:
  - `snippets(baseUrl: string, keys?: { publishable?: string }): { createSessionCurl: string; nextRouteHandler: string; verifyWebhook: string }`. `verifyWebhook` is the source of `examples/verify-webhook.ts`, read at build time via `?raw` import or kept identical by test.
  - `/docs` (public, no auth) sections: Quick start (1 create a project and copy your secret key, 2 create a checkout session, 3 redirect, 4 verify the webhook); Test cards (from `TEST_CARDS`); Webhooks (headers, retries, de-duplicate on `webhook-id`); API reference (endpoints and error shape, linking to `openapi.yaml` on GitHub); Limits (the caps table).
  - `examples/verify-webhook.ts` exports `POST(req: Request): Promise<Response>`, like a Next route handler.

- [ ] **Step 1: Write the failing tests:**
  - `verify-webhook.test.ts`: with `PAYSANDBOX_WEBHOOK_SECRET` set, a body signed by `signWebhook` → 200; a changed body → 400.
  - `snippets.test.ts`: `verifyWebhook` equals the file's content; `createSessionCurl` contains `${baseUrl}/api/v1/checkout_sessions` and `Idempotency-Key`; when keys are given, the publishable key appears.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(docs): public docs page; snippets shared and tested`.

---

### Task 7: Admin allowlist page

**Files:**
- Create: `src/lib/admin/allowlist.ts`, `src/app/admin/page.tsx`, `src/app/admin/actions.ts`
- Test: `src/lib/admin/allowlist.test.ts`

**Interfaces:**
- Produces:
  - `listAllowlist(db)`
  - `addToAllowlist(db, login: string, addedBy: string)` (lowercase, trim, GitHub login rules `^[a-z0-9-]{1,39}$`, error on invalid)
  - `removeFromAllowlist(db, login)`
  - `/admin` (Suspense; `requireUser`, and `notFound()` unless `isAdmin`): a list with remove buttons, an add form with toasts, and a count of users and projects.

- [ ] **Step 1: Write the failing tests:** an added login is lowercased; invalid logins are refused; removing is idempotent; and (with the action's user mocked) a non-admin calling the add action gets `notFound`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(admin): invite allowlist page`.

---

### Task 8: Security headers everywhere, gitleaks in CI

**Files:**
- Modify: `apps/web/next.config.ts`, `.github/workflows/ci.yml` (a `secrets` job: `gitleaks/gitleaks-action` with full history)
- Test: `apps/web/src/headers.test.ts` (reads `next.config.ts` `headers()` output)

**Interfaces:**
- Produces: the header rules from the Global Constraints; `/c/:path*` keeps its CSP.

- [ ] **Step 1: Write the failing test:** for `/`, `/docs`, `/dashboard/x`, `/demo`, `/admin` and `/api/v1/payments`, the matched headers include HSTS and nosniff; `/dashboard/x`, `/demo` and `/admin` include `X-Frame-Options: DENY`; `/c/x` keeps its CSP with `frame-ancestors 'none'` (PS-SEC-002).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Add the gitleaks job (PS-SEC-005); it runs on push and PR.
- [ ] **Step 4:** Run. Expected: PASS. Run `gitleaks detect` locally if installed, else rely on CI.
- [ ] **Step 5:** Commit: `feat(security): headers on every route; gitleaks in CI`.

---

### Task 9: Release-checks workflow: ZAP, Lighthouse, k6

**Files:**
- Create: `.github/workflows/release-checks.yml`, `apps/web/lighthouserc.json`, `apps/web/.zap/rules.tsv`, `apps/web/perf/k6-create-session.js`

**Interfaces:**
- Produces: a workflow on `schedule: weekly (Sunday 21:00 UTC)` and `workflow_dispatch`. It reuses the E2E job's setup (Postgres service, build, `next start`, seed), then:
  - ZAP baseline against `http://localhost:3090/demo` and `/docs`, failing on High alerts (PS-SEC-006)
  - Lighthouse CI on `/demo` and a seeded checkout URL, with mobile preset assertions: LCP < 2500 ms, CLS < 0.1, total-blocking-time < 300 ms, accessibility ≥ 0.95 (PS-PERF-001, PS-A11Y-001)
  - k6 create-session: 100 VUs for 2 min against the seeded E2E key, thresholds `http_req_duration p(95)<500`, `http_req_failed rate<0.01` (PS-PERF-003). The E2E API cap is raised by an E2E-only env `E2E_CAPS_MULTIPLIER` (never on Vercel).
  - Each report is uploaded as an artifact.

- [ ] **Step 1:** Write the k6 script and the configs. Add `E2E_CAPS_MULTIPLIER` to `capFor` (E2E mode only) with a unit test that it is ignored unless `isE2eMode()`.
- [ ] **Step 2:** Run the unit test. Expected: FAIL first, then PASS after the change.
- [ ] **Step 3:** Run the workflow locally where possible (`k6 run` if installed); otherwise validate the YAML with `actionlint` if available.
- [ ] **Step 4:** Commit: `ci: weekly release checks (ZAP, Lighthouse, k6)`.

---

### Task 10: Test-plan coverage report, and Plan 3 minors

**Files:**
- Create: `apps/web/scripts/test-plan-report.mjs`, `docs/test-plan-coverage.md` (generated)
- Modify: the Plan 3 minor sites: `DisputePanel.tsx` ("Accept and lose" disabled while sending), `ResendButton.tsx` (refreshes the page 3 s after success; the toast says "It shows below in a few seconds"), `lib/dashboard/customers.ts` ("Payments" counts captured payments only, with "Attempts" added beside it), and `request-log.test.ts` (one case with `createdAt` from the DB clock)
- Test: the corresponding component and unit tests

**Interfaces:**
- Produces: `node scripts/test-plan-report.mjs`, which reads the test plan's case IDs, greps `src/**/*.test.ts(x)` and `e2e/*.spec.ts` for them, and writes the coverage table (ID, priority, covered by, or "manual") with totals per priority. Root script `pnpm test-plan`.

- [ ] **Step 1: Write the failing tests** for the four minors:
  - two quick "Accept and lose" confirms → one call
  - Resend success → `router.refresh` called after 3 s (fake timers)
  - customers: `payments` counts only captured, `attempts` counts all
  - request log: µs-default timestamps page without repeats
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the fixes and the script; run `pnpm test-plan` and commit the generated report.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Check that the report's P0 rows are all covered or explicitly manual.
- [ ] **Step 5:** Commit: `chore: test-plan coverage report; Plan 3 minor fixes`.

---

### Task 11: End-to-end, once

**Files:**
- Create: `apps/web/e2e/demo.spec.ts`, `apps/web/e2e/docs-admin.spec.ts`; Modify: `e2e/helpers.ts` (`startDemo(page)`)

- [ ] **Step 1: Write the tests:**
  - `@smoke` PS-DEMO-001: `/demo` → "Start your demo sandbox" → the store, the banner and the `ps_guest` cookie (`httpOnly: true`); the dashboard Overview shows the seeded totals.
  - PS-DEMO-004: Checkout → pay with 3220 + OTP 123456 → `/demo/thanks` → payment link → refund PKR 1,000 → Simulate dispute → win; the Webhooks page shows receipts marked "Verified" for `payment.succeeded`, `refund.created`, `dispute.created` and `dispute.closed`.
  - PS-DEMO-005: toggle "Return 500" → Send test event → the receipt shows 500 and the event's attempts show a retry scheduled.
  - PS-DEMO-002 `@smoke`: a second browser's sandbox URLs opened with the first browser's cookie → the 404 page.
  - PS-DEMO-006: `GET /api/v1/payments` with the example key shown → 401.
  - PS-DEV-001: run the docs' `createSessionCurl` (with the E2E key and base URL substituted) via `execFile('curl', …)` → 200 with `cs_test_`.
  - `/docs` and `/admin`: docs load signed-out (axe clean); `/admin` as a non-admin → 404.
  - PS-A11Y-006: `/demo` and the dashboard at 320 px wide have no horizontal page scroll.
- [ ] **Step 2:** Run the new specs plus `checkout.spec.ts` (the headers changed) once: `pnpm --filter web exec playwright test e2e/demo.spec.ts e2e/docs-admin.spec.ts e2e/checkout.spec.ts`. Expected: PASS.
- [ ] **Step 3:** Commit: `test(e2e): demo sandbox loop, isolation, receiver, docs snippet, admin`.

---

### Task 12: Ship v1.0.0

- [ ] **Step 1:** Final whole-branch review (one fresh reviewer, most capable model); fix Critical and Important with failing tests first.
- [ ] **Step 2:** Open the PR `plan-4/demo-docs-release` → `main`. Don't watch CI.
- [ ] **Step 3 [Abdul]:** Approve the merge (it deploys production).
- [ ] **Step 4:** Production check:
  - open `/demo` in a private window, then run the full loop (buy, OTP, refund, dispute) and see the receipts verified
  - check `/docs`
  - check `/admin` as Abdul
  - trigger the release-checks workflow once (`gh workflow run release-checks.yml`), with Abdul's OK, and report its artifacts
- [ ] **Step 5:** Tag `v1.0.0`; mark Plan 4 done in the roadmap; update the README (demo link, docs link).
