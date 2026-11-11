# PaySandbox Plan 2: Webhooks, Timers, Refunds and Disputes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant sets one webhook endpoint on their project and receives every event as a signed Standard Webhooks POST, with retries on the published schedule. Sessions expire on time, card 0259 opens a dispute a minute after paying, unanswered disputes are lost after 7 days, and `POST /v1/refunds` refunds fully or partly without ever overspending. `GET /v1/events/{id}` returns any event. It is all live on the same free Vercel + Neon deploy, plus Upstash QStash.

**Architecture:** Every timed or retried piece of work is a row in a `jobs` table (a transactional outbox), written in the same transaction as the change that needs it. After the response, the route runs that merchant's due jobs inline (the first webhook attempt costs no QStash message) and publishes the future ones to QStash with `notBefore`. QStash calls `/api/internal/jobs`, which claims the job with a 60 s lease and runs its handler. Handlers are idempotent on database state. A daily Vercel cron runs anything overdue as a safety net. Tests and E2E drive jobs directly; nothing depends on QStash outside production.

**Tech Stack:** As Plan 1, plus `@upstash/qstash` (publish + signature verify), `standardwebhooks` (signing, and verifying in tests), `undici` (its `fetch` + `Agent` with a checked DNS lookup, for SSRF-safe delivery). Pin exact versions that are at least two weeks old at install time.

**Spec:** `docs/superpowers/specs/2026-11-11-paysandbox-v1-design.md` §4, §5, §6.7–6.10, §7 (webhook URLs, signing secret), §7a, §8, §9 (refunds, events). Test case IDs (`PS-WH-004`) refer to `…-test-plan.md`.

## Global Constraints

Plan 1's Global Constraints all still apply. In addition:

- Webhook headers exactly `webhook-id` (= event ID, the same on every retry), `webhook-timestamp` (unix seconds), `webhook-signature` (`v1,<base64 HMAC-SHA256 of "id.timestamp.body">`). During a secret roll (24 h) the header carries two signatures separated by one space, new first.
- Signing secret: `whsec_` + base64 of 24 random bytes. Stored encrypted with AES-256-GCM; the key is env `WEBHOOK_SECRET_KEY` (base64 of 32 bytes). Revealable only to the project owner.
- Delivery schedule: attempt 1 at once, then 1 min, 5 min, 30 min, 2 h, 6 h after the previous attempt. After attempt 6 fails, the delivery is `failed`. 2xx = delivered; anything else, a timeout or a network error = failed attempt.
- Request: `POST`, `content-type: application/json`, 10 s timeout, redirects not followed (a 3xx is a failure), response read up to 64 KB, first 1 KB stored as `response_snippet`.
- After **20 consecutive failed deliveries** (events, not attempts) the endpoint is disabled with `disabled_reason = 'too_many_failures'`. Any delivered event resets the count to 0.
- Endpoint URL: `https://` only; refused if the host resolves to any private, loopback, link-local, CGNAT, multicast, unspecified or metadata address, both when saved and at connect time on every send. The only exception is E2E mode (`isE2eMode()`, never true on Vercel), which allows `http://127.0.0.1`/`localhost` for the test receiver.
- One endpoint per merchant. One `webhook_deliveries` row per (event, endpoint); one `webhook_attempts` row per attempt. Events are delivered only to an endpoint that existed and was enabled when the event was recorded.
- Event envelope (API and webhook body): `{ "id": "evt_…", "object": "event", "type", "created", "livemode": false, "data": { "object": <snapshot> } }`. Snapshots are the API objects (`payment`, `refund`, `dispute`) at that moment, amounts in paisa.
- Event types exactly: `payment.succeeded`, `payment.failed`, `payment.requires_action`, `refund.created`, `dispute.created`, `dispute.closed`.
- Refunds: `{ payment, amount?, reason }`; `reason` ∈ `requested_by_customer` | `duplicate` | `fraudulent` (required); `amount` integer ≥ 1, defaults to the amount left. Allowed on `succeeded` / `partially_refunded` only; `disputed` → `400 payment_disputed`; other statuses → `400 payment_not_refundable`; more than left → `400 amount_too_large`. One transaction with `FOR UPDATE` on the payment.
- Disputes: amount = amount left at opening; `respond_by` = opened + 7 days; one dispute per payment, ever; won → payment returns to `previous_payment_status`; lost → `dispute_lost`. Card 0259 opens one 60 s after it succeeds, with reason `fraudulent`. No public API for disputes in v1.
- Session expiry: one `expire_session` job at `expires_at`. It moves an `open` session to `expired` and any `requires_action` payment on it to `failed` (`authentication_failed`), recording `payment.failed`. **Reads still never write.**
- Every payment status change goes through `canTransition()` (`lib/payments/state.ts`); an illegal one throws.
- Caps: webhook attempts 500/day per merchant (over the cap, the job is moved to the next Karachi midnight, not dropped); "Send test event" 50/day.
- Never log webhook secrets, receiver response bodies or event payloads. The snippet goes only to `webhook_attempts`.
- New env vars: `WEBHOOK_SECRET_KEY`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`. Without `QSTASH_TOKEN` the scheduler is a no-op (local dev, CI, E2E).
- New ID prefixes: `we_` (endpoint), `dlv_` (delivery), `att_` (attempt), `re_` (refund), `dp_` (dispute), `job_` (job).

**Plan calls (deviations from the design, each for a stated reason):**
1. The design's single `webhook_deliveries` table is split into `webhook_deliveries` (one per event and endpoint, holding `state`, `attempt_count`, `next_attempt_at`) and `webhook_attempts` (one per HTTP attempt). One row per attempt cannot also hold a delivery's state without duplicating it.
2. A `jobs` outbox table carries all timers and retries, so a QStash outage or a lost message never loses work, and tests run jobs without QStash.
3. The webhook endpoint card (URL, secret reveal and roll, re-enable, "Send test event") goes on the existing Projects page now, so Plan 2 can be used. The full Webhooks page with the event log and attempt detail stays in Plan 3.
4. Dispute "win" and "lose" exist as engine functions with tests. Their buttons come with Plan 3's payment detail page, as do the event log, "Resend now" (PS-WH-009) and the dashboard refund form.

## Review Focus

1. **DNS rebinding:** the host resolves to a public IP when saved and to `10.0.0.5` at send time. Expected: the request is never made, and the attempt is a failure with `blocked_address`. The check runs inside undici's `connect.lookup`, not before `fetch`. Test in Task 7.
2. **The same job runs twice** (QStash redelivers, or the daily cron and QStash fire together). Expected: exactly one HTTP attempt and one state change, through the lease claim. Test in Task 5 and Task 7.
3. **A refund racing card 0259's dispute** (both lock the payment). Expected: whichever runs second sees the first's result. A dispute never holds more than the amount left, and a disputed payment is never refunded. Test in Task 11.
4. **Endpoint URL changed or secret rolled while retries are pending.** Expected: the next attempt goes to the current URL and carries the current signatures (both during a roll), with the same `webhook-id`. Test in Task 7.
5. **A receiver that hangs or streams a huge body.** Expected: failure after the timeout, at most 64 KB read, no crash. `/api/internal/jobs` declares `maxDuration = 60`. Test in Task 7.

---

## File structure

```
apps/web/
  vercel.json                                       # daily cron → /api/internal/cron (Task 8)
  drizzle/0002_*.sql                                # Task 1
  src/
    lib/
      ids.ts                                        # + we, dlv, att, re, dp, job (Task 1)
      crypto/secretbox.ts                           # AES-256-GCM (Task 2)
      webhooks/signing.ts  ssrf.ts  endpoints.ts  deliver.ts  test-events.ts
      jobs/jobs.ts  scheduler.ts  handlers.ts  flush.ts
      events/record.ts  events/objects.ts           # envelope + delivery enqueue (Task 6)
      sessions/expire.ts                            # Task 9
      refunds/refunds.ts  refunds/input.ts          # Task 10
      disputes/disputes.ts                          # Task 11
      merchants/merchants.ts                        # + getOwnedMerchant (Task 12)
    app/
      api/v1/refunds/route.ts  api/v1/events/[id]/route.ts
      api/internal/jobs/route.ts  api/internal/cron/route.ts  api/internal/e2e/run-jobs/route.ts
      dashboard/projects/WebhookEndpointCard.tsx  dashboard/projects/webhook-actions.ts
    test/factories.ts                               # + makePayment, makeEndpoint (Task 1)
  e2e/receiver.ts  e2e/webhooks.spec.ts             # Task 13
openapi.yaml                                        # Refund, Event, CreateRefund (Tasks 6, 10)
```

---

### Task 1: Schema, IDs, dependencies and env

**Files:**
- Modify: `apps/web/src/lib/db/schema.ts`, `apps/web/src/lib/ids.ts`, `apps/web/src/test/factories.ts`, `apps/web/package.json`, `apps/web/.env.example`, `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`
- Create: `apps/web/drizzle/0002_*.sql` (generated)
- Test: `apps/web/src/lib/db/schema.test.ts` (extend if it exists, else create)

**Interfaces:**
- Produces tables (Drizzle names, `casing: 'snake_case'`):
  - `webhookEndpoints`: `id`, `merchantId` (unique, cascade), `url`, `secretEncrypted`, `previousSecretEncrypted` (null), `previousSecretExpiresAt` (null), `enabled` (default true), `consecutiveFailures` (int, default 0), `disabledReason` (null), `createdAt`, `updatedAt`
  - `webhookDeliveries`: `id`, `merchantId`, `eventId` (cascade), `endpointId` (cascade), `state` enum `pending|delivered|failed`, `attemptCount` (int 0), `nextAttemptAt` (null), `lastError` (null), `createdAt`, `updatedAt`; unique (`eventId`, `endpointId`)
  - `webhookAttempts`: `id`, `deliveryId` (cascade), `attempt` (int), `url`, `statusCode` (null = network/timeout/blocked), `error` (null: `timeout|network|blocked_address|redirect`), `durationMs`, `responseSnippet` (null), `requestHeaders` (jsonb), `attemptedAt`
  - `refunds`: `id`, `merchantId`, `paymentId`, `amount` (money), `reason` text enum, `status` text default `succeeded`, `createdAt`
  - `disputes`: `id`, `merchantId`, `paymentId` (unique), `amount`, `reason`, `status` enum `needs_response|won|lost`, `previousPaymentStatus` (paymentStatus enum), `respondBy`, `createdAt`, `closedAt` (null)
  - `jobs`: `id`, `merchantId` (cascade), `kind` enum `deliver_webhook|expire_session|open_dispute|dispute_deadline`, `refId`, `runAt`, `state` enum `pending|done`, `attempts` (int 0), `lockedUntil` (null), `publishedAt` (null), `lastError` (null), `createdAt`; index (`state`, `runAt`), index (`merchantId`, `state`, `runAt`)
- `IdPrefix` gains `'we' | 'dlv' | 'att' | 're' | 'dp' | 'job'`.
- Factory: `makePayment(db, merchantId, overrides?)` (creates a session and customer if not given; default `status: 'succeeded'`, `amount: 510000`, `testCard: 'visa_success'`).

- [ ] **Step 1:** Install the three dependencies (exact versions, ≥ 2 weeks old). Add to `.env.example`: `WEBHOOK_SECRET_KEY=` (comment: `openssl rand -base64 32`), `QSTASH_TOKEN=`, `QSTASH_CURRENT_SIGNING_KEY=`, `QSTASH_NEXT_SIGNING_KEY=` (comment: empty = no scheduling, jobs run inline or by cron), `CRON_SECRET=`. Add a fixed test `WEBHOOK_SECRET_KEY` (32 zero bytes, base64) to `ci.yml` env, to the Playwright `webServer.env`, and to `vitest.config.mts` `test.env`.
- [ ] **Step 2: Write the failing test:** `it('creates the Plan 2 tables', …)` inserts one row into each new table (endpoint `secretEncrypted` can be any string here), and checks `newId('dp')` matches `/^dp_[0-9A-Za-z]{24}$/`.
- [ ] **Step 3:** Run `pnpm --filter web exec vitest run src/lib/db`. Expected: FAIL (tables missing).
- [ ] **Step 4:** Add the tables, enums, prefixes and factories; run `pnpm --filter web db:generate`.
- [ ] **Step 5:** Run the test again. Expected: PASS. Run `pnpm test`. Expected: all Plan 1 tests still pass.
- [ ] **Step 6:** Commit: `feat(db): webhook, refund, dispute and job tables`.

---

### Task 2: Secret encryption and Standard Webhooks signing

**Files:**
- Create: `apps/web/src/lib/crypto/secretbox.ts`, `apps/web/src/lib/webhooks/signing.ts`
- Test: `apps/web/src/lib/crypto/secretbox.test.ts`, `apps/web/src/lib/webhooks/signing.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(plain: string): string`: format `v1.<iv b64url>.<tag b64url>.<ciphertext b64url>`, 12-byte random IV. `decryptSecret(box: string): string` throws on a tampered box. Both throw `Error('WEBHOOK_SECRET_KEY is not set')` when the env is missing or not 32 bytes.
  - `newSigningSecret(): string`
  - `type WebhookHeaders = { 'webhook-id': string; 'webhook-timestamp': string; 'webhook-signature': string }`
  - `signWebhook(secrets: string[], msgId: string, timestamp: Date, body: string): WebhookHeaders`: signs with each secret using the `standardwebhooks` library's `Webhook#sign`, then joins the signatures with one space, in the order given.

- [ ] **Step 1: Write the failing tests**

```ts
// signing.test.ts: verification uses the official library, as receivers will
const secret = newSigningSecret();
const body = JSON.stringify({ id: 'evt_x', type: 'payment.succeeded' });
const at = new Date();
const h = signWebhook([secret], 'evt_x', at, body);
expect(new Webhook(secret).verify(body, h)).toBeTruthy(); // PS-WH-001 contract
expect(() => new Webhook(secret).verify(body + ' ', h)).toThrow(); // PS-WH-002
const old = signWebhook([secret], 'evt_x', new Date(Date.now() - 6 * 60_000), body);
expect(() => new Webhook(secret).verify(body, old)).toThrow(); // PS-WH-003: 5-minute window
const rolled = signWebhook([newer, secret], 'evt_x', at, body);
expect(rolled['webhook-signature'].split(' ')).toHaveLength(2); // PS-WH-016
expect(new Webhook(secret).verify(body, rolled)).toBeTruthy();
expect(new Webhook(newer).verify(body, rolled)).toBeTruthy();
expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{32}$/); // 24 bytes → 32 base64 chars
```

```ts
// secretbox.test.ts
expect(decryptSecret(encryptSecret('whsec_abc'))).toBe('whsec_abc');
expect(encryptSecret('x')).not.toBe(encryptSecret('x')); // fresh IV
expect(() => decryptSecret(flipLastChar(encryptSecret('x')))).toThrow();
vi.stubEnv('WEBHOOK_SECRET_KEY', ''); expect(() => encryptSecret('x')).toThrow('WEBHOOK_SECRET_KEY is not set');
```

- [ ] **Step 2:** Run both files. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement with `node:crypto` (`aes-256-gcm`) and `standardwebhooks`.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(webhooks): encrypted signing secrets and Standard Webhooks signatures`.

---

### Task 3: SSRF guard

**Files:**
- Create: `apps/web/src/lib/webhooks/ssrf.ts`
- Test: `apps/web/src/lib/webhooks/ssrf.test.ts`

**Interfaces:**
- Produces:
  - `isPublicAddress(ip: string): boolean`: false for IPv4 `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, and `::ffff:a.b.c.d` checked as its IPv4. Built on `node:net` `BlockList`.
  - `type Resolver = (host: string) => Promise<string[]>`; `defaultResolver` uses `dns.promises.lookup(host, { all: true })`.
  - `type UrlCheck = { ok: true; url: string } | { ok: false; code: 'url_invalid' | 'url_not_https' | 'url_private_address' | 'url_unresolvable'; message: string }`
  - `validateEndpointUrl(raw: string, opts: { resolve: Resolver; allowPrivate: boolean }): Promise<UrlCheck>`: trims; refuses credentials in the URL and URLs over 2,048 chars as `url_invalid`; refuses if **any** resolved address is not public. `allowPrivate` (E2E mode) skips the address check and allows `http:` only when the host is `localhost` or `127.0.0.1`; every other `http:` URL is still `url_not_https`.
  - `checkedLookup(allowPrivate: boolean)`: a `net.LookupFunction`-compatible function for undici's `connect.lookup`. It resolves, then calls back with `Object.assign(new Error('blocked_address'), { code: 'EBLOCKED' })` if an address is not public.

- [ ] **Step 1: Write the failing tests** (PS-WH-013), with a fake resolver:

```ts
const resolve: Resolver = async (h) => ({ 'hooks.example.com': ['93.184.216.34'], 'evil.example.com': ['10.0.0.5'] })[h] ?? [];
for (const url of ['http://hooks.example.com/x', 'http://localhost:3000', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://10.0.0.5'])
  expect((await validateEndpointUrl(url, { resolve, allowPrivate: false })).ok).toBe(false);
expect(await validateEndpointUrl('https://evil.example.com/x', { resolve, allowPrivate: false })).toMatchObject({ ok: false, code: 'url_private_address' });
expect(await validateEndpointUrl('https://[::1]/x', { resolve, allowPrivate: false })).toMatchObject({ ok: false, code: 'url_private_address' });
expect(await validateEndpointUrl('https://nope.example.com', { resolve, allowPrivate: false })).toMatchObject({ ok: false, code: 'url_unresolvable' });
expect(await validateEndpointUrl(' https://hooks.example.com/ps ', { resolve, allowPrivate: false })).toEqual({ ok: true, url: 'https://hooks.example.com/ps' });
expect((await validateEndpointUrl('http://127.0.0.1:4555/hook', { resolve, allowPrivate: true })).ok).toBe(true); // E2E mode only
expect(await validateEndpointUrl('http://10.0.0.5/x', { resolve, allowPrivate: true })).toMatchObject({ ok: false, code: 'url_not_https' });
expect(isPublicAddress('::ffff:10.0.0.5')).toBe(false);
expect(isPublicAddress('8.8.8.8')).toBe(true);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. IP literals in the URL are checked directly without a lookup.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(webhooks): SSRF guard for endpoint URLs`.

---

### Task 4: Webhook endpoint management

**Files:**
- Create: `apps/web/src/lib/webhooks/endpoints.ts`
- Test: `apps/web/src/lib/webhooks/endpoints.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`, `decryptSecret`, `newSigningSecret` (Task 2); `validateEndpointUrl`, `Resolver` (Task 3).
- Produces:
  - `type EndpointRow = typeof webhookEndpoints.$inferSelect`
  - `class EndpointError extends Error { code: UrlCheck['code'] | 'not_found' }`
  - `setWebhookEndpoint(db: Db, merchantId: string, url: string, now: Date, opts: { resolve: Resolver; allowPrivate: boolean }): Promise<EndpointRow>`: creates the endpoint with a new secret, or changes the URL of the existing one (same secret). Saving also re-enables it and resets `consecutiveFailures`.
  - `getWebhookEndpoint(db: Db, merchantId: string): Promise<EndpointRow | null>`
  - `revealWebhookSecret(db: Db, merchantId: string): Promise<string>`
  - `rollWebhookSecret(db: Db, merchantId: string, now: Date): Promise<string>`: the new secret; the old one goes to `previousSecretEncrypted` with `previousSecretExpiresAt = now + 24 h`.
  - `reenableWebhookEndpoint(db: Db, merchantId: string): Promise<void>`
  - `activeSecrets(row: EndpointRow, now: Date): string[]`: `[current]`, or `[current, previous]` while the previous one hasn't expired.
  - `ENDPOINT_DISABLE_AFTER = 20`
  - Factory in `src/test/factories.ts`: `makeEndpoint(db, merchantId, overrides?: { url?: string; enabled?: boolean }): Promise<{ endpoint: EndpointRow; secret: string }>` (default URL `https://hooks.example.com/ps`), inserting directly, without DNS.

- [ ] **Step 1: Write the failing tests:** create, then change the URL (secret unchanged); refuse `http://10.0.0.5` with `EndpointError` code `url_not_https`; roll gives two `activeSecrets` until +24 h and one after; `revealWebhookSecret` after a roll returns the new one; the DB never holds the plain secret (`expect(JSON.stringify(row)).not.toContain(secret)`); setting a URL re-enables a disabled endpoint.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(webhooks): one endpoint per project with secret roll`.

---

### Task 5: Jobs outbox, scheduler and lease

**Files:**
- Create: `apps/web/src/lib/jobs/jobs.ts`, `apps/web/src/lib/jobs/scheduler.ts`
- Test: `apps/web/src/lib/jobs/jobs.test.ts`, `apps/web/src/lib/jobs/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `type JobKind = 'deliver_webhook' | 'expire_session' | 'open_dispute' | 'dispute_deadline'`; `type JobRow = typeof jobs.$inferSelect`
  - `enqueueJob(db: Db, j: { merchantId: string; kind: JobKind; refId: string; runAt: Date; now: Date }): Promise<string>`: insert only; safe inside a transaction.
  - `type JobOutcome = { done: true } | { retryAt: Date }`; `type JobHandler = (db: Db, job: JobRow, now: Date) => Promise<JobOutcome>`; `type JobHandlers = Record<JobKind, JobHandler>`
  - `JOB_LEASE_SECONDS = 60`
  - `runJob(db: Db, jobId: string, now: Date, handlers: JobHandlers): Promise<'ran' | 'skipped'>`. It claims with a single `UPDATE … SET locked_until = now + 60 s, attempts = attempts + 1 WHERE id = $1 AND state = 'pending' AND run_at <= now AND (locked_until IS NULL OR locked_until < now) RETURNING *`. No row means `'skipped'`. Then: `done` sets `state = 'done'`; `retryAt` sets `run_at = retryAt, published_at = NULL, locked_until = NULL`. A handler that throws leaves the lease to expire and stores `last_error = err.name` (the error is re-thrown).
  - `runDueJobs(db: Db, now: Date, handlers: JobHandlers, filter?: { merchantId?: string; limit?: number }): Promise<number>`: due pending jobs, oldest first, default limit 50; returns how many ran.
  - `type Scheduler = { publish(job: { id: string; runAt: Date }): Promise<void> }`
  - `publishPendingJobs(db: Db, scheduler: Scheduler, now: Date): Promise<number>`: pending, unpublished jobs whose `run_at > now`; publishes each, then sets `published_at`. A publish error leaves the job unpublished, for the cron to run later.
  - `scheduler.ts`: `getScheduler(): Scheduler`. With `QSTASH_TOKEN`, it calls `publishJSON({ url: `${appUrl()}/api/internal/jobs`, body: { jobId }, notBefore: unix seconds, deduplicationId: jobId })`; without it, a no-op. Also `verifyQstashSignature(signature: string | null, body: string): Promise<boolean>` (QStash `Receiver` with the two signing keys).

- [ ] **Step 1: Write the failing tests** (Review Focus 2):

```ts
const calls: string[] = [];
const handlers = fakeHandlers({ deliver_webhook: async () => (calls.push('x'), { done: true }) });
const id = await enqueueJob(db, { merchantId, kind: 'deliver_webhook', refId: 'dlv_1', runAt: now, now });
const [a, b] = await Promise.all([runJob(db, id, now, handlers), runJob(db, id, now, handlers)]);
expect([a, b].sort()).toEqual(['ran', 'skipped']);
expect(calls).toHaveLength(1);
expect(await runJob(db, id, addSeconds(now, 120), handlers)).toBe('skipped'); // done stays done
// not yet due
const later = await enqueueJob(db, { …, runAt: addSeconds(now, 60), now });
expect(await runJob(db, later, now, handlers)).toBe('skipped');
// retry re-arms and unpublishes
// handler throwing: lease blocks a rerun for 60 s, then allows it
// publishPendingJobs publishes only future, unpublished jobs, once
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Test the scheduler with a mocked `@upstash/qstash` `Client`: the body is `{ jobId }`, `notBefore` is in seconds, and with no token nothing is called.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(jobs): transactional job outbox with lease and QStash scheduler`.

---

### Task 6: Event envelope, delivery enqueue and `GET /v1/events/{id}`

**Files:**
- Create: `apps/web/src/lib/events/objects.ts`, `apps/web/src/app/api/v1/events/[id]/route.ts`
- Modify: `apps/web/src/lib/events/record.ts`, `openapi.yaml` (schema `Event`, path `/events/{id}`)
- Test: `apps/web/src/lib/events/record.test.ts`, `apps/web/src/app/api/v1/events/events.api.test.ts`

**Interfaces:**
- Consumes: `getWebhookEndpoint` (Task 4), `enqueueJob` (Task 5).
- Produces:
  - `recordEvent(db, e)`: same signature as Plan 1. If the merchant has an **enabled** endpoint, it also inserts a `webhook_deliveries` row (`pending`, `nextAttemptAt = now`) and an immediate `deliver_webhook` job whose `refId` is the delivery ID, in the same transaction.
  - `type EventRow = typeof events.$inferSelect`; `toEventObject(row: EventRow)`: the envelope from the Global Constraints.
  - `getEvent(db: Db, merchantId: string, id: string): Promise<EventRow | null>`

- [ ] **Step 1: Write the failing tests:** recording with no endpoint creates no delivery; with an enabled endpoint, one delivery plus one job due now; with a disabled endpoint, none. `GET /api/v1/events/{id}` returns the envelope and matches `openapi.yaml#Event` (`expectMatchesSchema('Event', body)`); `livemode` is false and `data.object.amount` is an integer (PS-WH-011). Another merchant's event ID returns 404 `resource_missing`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; the route uses `withApi`.
- [ ] **Step 4:** Run. Expected: PASS, and `pnpm test` stays green (Plan 1's pay and OTP tests now create events with no endpoint).
- [ ] **Step 5:** Commit: `feat(events): event envelope, delivery enqueue and GET /v1/events/{id}`.

---

### Task 7: Delivery attempts, retries and auto-disable

**Files:**
- Create: `apps/web/src/lib/webhooks/deliver.ts`
- Test: `apps/web/src/lib/webhooks/deliver.test.ts` (real HTTP against a `node:http` server on `127.0.0.1`, with `allowPrivate: true`, except the SSRF cases)

**Interfaces:**
- Consumes: `signWebhook` (Task 2), `checkedLookup`, `Resolver` (Task 3), `activeSecrets`, `ENDPOINT_DISABLE_AFTER` (Task 4), `JobOutcome` (Task 5), `toEventObject` (Task 6), `consumeUsage` (Plan 1).
- Produces:
  - `RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 360] as const`; `MAX_ATTEMPTS = 6`; `DELIVERY_TIMEOUT_MS = 10_000`; `MAX_RESPONSE_BYTES = 65_536`; `SNIPPET_BYTES = 1024`
  - `type DeliveryDeps = { allowPrivate: boolean; timeoutMs: number }`; `defaultDeliveryDeps()` = `{ allowPrivate: isE2eMode(), timeoutMs: DELIVERY_TIMEOUT_MS }`
  - `attemptDelivery(db: Db, deliveryId: string, now: Date, deps: DeliveryDeps): Promise<JobOutcome>`:
    1. Load the delivery, its event and its endpoint. If the delivery isn't `pending`, return `done`. If the endpoint is disabled, mark the delivery `failed` (`lastError: 'endpoint_disabled'`) and return `done`.
    2. `consumeUsage(…, 'webhook_attempts')`. Over the cap: return `{ retryAt: next Karachi midnight }`; no attempt row, no count.
    3. POST the envelope (`JSON.stringify(toEventObject(event))`) to the endpoint's **current** URL with `signWebhook(activeSecrets(endpoint, now), event.id, now, body)`. Use undici `fetch` with `redirect: 'manual'`, `signal: AbortSignal.timeout(deps.timeoutMs)`, and a `dispatcher` that is an `Agent({ connect: { lookup: checkedLookup(deps.allowPrivate) } })`. Read the body up to `MAX_RESPONSE_BYTES`, then cancel the stream.
    4. Insert a `webhook_attempts` row (with `error` set for timeout, network, blocked or 3xx).
    5. On 2xx: delivery `delivered`, endpoint `consecutiveFailures = 0`, return `done`. Otherwise, if `attempt < MAX_ATTEMPTS`: set `nextAttemptAt = now + RETRY_DELAYS_MINUTES[attempt - 1]` and return that as `retryAt`. If it was the last attempt: delivery `failed`; endpoint `consecutiveFailures + 1`, disabled at `ENDPOINT_DISABLE_AFTER`; return `done`.
  - `deliverWebhookJob: JobHandler` = `(db, job, now) => attemptDelivery(db, job.refId, now, defaultDeliveryDeps())`

- [ ] **Step 1: Write the failing tests:**
  - PS-WH-004: the server answers 500 then 200. Attempt 1 returns `retryAt = now + 1 min`; attempt 2 delivers. Both requests have the same `webhook-id` and both verify with `standardwebhooks`.
  - PS-WH-005: the server never answers and `timeoutMs` is 200. The attempt has `error: 'timeout'` and a retry is scheduled.
  - PS-WH-006: a 302 is a failure with `error: 'redirect'`, and the `Location` is not requested.
  - PS-WH-007: 6 failures land at +0, +1, +6, +36, +156 and +516 min from the first, then the delivery is `failed`. 20 failed deliveries in a row disable the endpoint with `too_many_failures`; one success in between resets the count.
  - PS-WH-014: a 10 MB body. At most 65,536 bytes are read, the snippet is ≤ 1,024 bytes, and the test finishes under 2 s.
  - Review Focus 1: `allowPrivate: false` and a URL that resolves to `127.0.0.1` at connect time. No request reaches the server, and the attempt has `error: 'blocked_address'`.
  - Review Focus 4: between attempt 1 and 2, `setWebhookEndpoint` changes the URL and `rollWebhookSecret` runs. Attempt 2 hits the new server with two signatures, and both secrets verify.
  - Cap: with `webhook_attempts` already at 500 today, the result is `retryAt` = next Karachi midnight, and there is no attempt row.
  - Review Focus 2: two `runJob` calls on the same delivery job make one HTTP request.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(webhooks): signed delivery with retries, SSRF-safe connect and auto-disable`.

---

### Task 8: Job routes, cron and after-response flush

**Files:**
- Create: `apps/web/src/lib/jobs/handlers.ts`, `apps/web/src/lib/jobs/flush.ts`, `apps/web/src/app/api/internal/jobs/route.ts`, `apps/web/src/app/api/internal/cron/route.ts`, `apps/web/src/app/api/internal/e2e/run-jobs/route.ts`, `apps/web/vercel.json`
- Modify: `apps/web/src/app/api/v1/checkout_sessions/route.ts`, `apps/web/src/app/c/[sessionId]/pay/route.ts`, `apps/web/src/app/c/[sessionId]/otp/route.ts`, `apps/web/src/test/setup-node.ts`
- Test: `apps/web/src/app/api/internal/internal.api.test.ts`

**Interfaces:**
- Consumes: Tasks 5 and 7. `expire_session` and the two dispute handlers start as stubs returning `{ done: true }`; Tasks 9 and 11 replace them.
- Produces:
  - `jobHandlers: JobHandlers`
  - `flushJobsAfterResponse(merchantId: string): void`: `after(async () => { const now = new Date(); await runDueJobs(getDb(), now, jobHandlers, { merchantId }); await publishPendingJobs(getDb(), getScheduler(), new Date()); })`, with errors sent to `reportError('jobs flush', e)`. `setup-node.ts` mocks this module to a no-op (`vi.mock('@/lib/jobs/flush')`); unit tests drive jobs directly.
  - `POST /api/internal/jobs`: `export const maxDuration = 60`. Bad or missing `upstash-signature` → 401. Body `{ jobId }` → `runJob`, then `publishPendingJobs` → 200 `{ result }`. A handler throw → 500, so QStash retries.
  - `GET /api/internal/cron`: needs `Authorization: Bearer ${CRON_SECRET}` (else 401). Runs `runDueJobs` with no filter (limit 200), then `publishPendingJobs`.
  - `POST /api/internal/e2e/run-jobs` with `{ advanceSeconds: number }`: `notFound()` unless `isE2eMode()`. Otherwise `runDueJobs(db, now + advanceSeconds, …)`, and returns `{ ran }`.
  - `vercel.json`: `{ "crons": [{ "path": "/api/internal/cron", "schedule": "0 21 * * *" }] }`
  - The checkout-session POST, `/c/…/pay` and `/c/…/otp` call `flushJobsAfterResponse(merchantId)` after their work succeeds.

- [ ] **Step 1: Write the failing tests:**
  - The jobs route returns 401 with no signature, or a wrong one (`verifyQstashSignature` mocked to false). It returns 200 with a valid one, and the job ran.
  - The cron route returns 401 without the bearer and 200 with it, and runs an overdue job.
  - The E2E route returns 404 when `E2E_AUTH_BYPASS` is unset, and with it, `advanceSeconds: 61` runs a job due in 60 s.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, then `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(jobs): QStash job route, daily cron and after-response flush`.

---

### Task 9: Session expiry timer

**Files:**
- Create: `apps/web/src/lib/sessions/expire.ts`
- Modify: `apps/web/src/lib/sessions/sessions.ts` (enqueue at create), `apps/web/src/lib/jobs/handlers.ts`
- Test: `apps/web/src/lib/sessions/expire.test.ts`

**Interfaces:**
- Produces: `expireSession(db: Db, sessionId: string, now: Date): Promise<JobOutcome>`. It locks the session. If the session is `open` and `expiresAt <= now`: status becomes `expired`; every `requires_action` payment on it becomes `failed` with `failureCode: 'authentication_failed'`, an activity row "Session expired before OTP" and `payment.failed`. Otherwise it is a no-op. Always returns `done`. `createCheckoutSession` enqueues `expire_session` at `expiresAt`.

- [ ] **Step 1: Write the failing tests:**
  - Creating a session makes one `expire_session` job at +24 h.
  - Running the job at +24 h expires an open session and fails its pending OTP payment with one `payment.failed` event.
  - A paid (`complete`) session is unchanged.
  - Running it early (+23 h) changes nothing.
  - Reading an expired-by-time session (`GET /v1/checkout_sessions/{id}`) still writes nothing. This is Plan 1's rule, re-asserted with row counts.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; wire into `jobHandlers.expire_session`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sessions): expire sessions on time and fail pending OTP payments`.

---

### Task 10: Refunds engine and `POST /v1/refunds`

**Files:**
- Create: `apps/web/src/lib/refunds/refunds.ts`, `apps/web/src/lib/refunds/input.ts`, `apps/web/src/app/api/v1/refunds/route.ts`
- Modify: `openapi.yaml` (schemas `Refund`, `CreateRefund`; path `POST /refunds`)
- Test: `apps/web/src/lib/refunds/refunds.test.ts`, `apps/web/src/app/api/v1/refunds/refunds.api.test.ts`

**Interfaces:**
- Consumes: `canTransition` (Plan 1), `recordEvent`, `addActivity` (Plan 1, `lib/payments/pay.ts`).
- Produces:
  - `REFUND_REASONS = ['requested_by_customer', 'duplicate', 'fraudulent'] as const`; `type RefundRow`
  - `parseCreateRefund(body: unknown): { payment: string; amount?: number; reason: (typeof REFUND_REASONS)[number] }`: throws `ApiError` 400 with `parameter_missing` / `parameter_invalid` / `amount_not_integer` / `amount_too_small`, and `param` set.
  - `createRefund(db: Db, r: { merchantId: string; paymentId: string; amount?: number; reason: string; now: Date }): Promise<{ refund: RefundRow; payment: PaymentRow }>`. One transaction, payment row `FOR UPDATE`. Errors are `ApiError`: 404 `resource_missing`, 400 `payment_disputed`, 400 `payment_not_refundable`, 400 `amount_too_large`. It updates `amountRefunded` and status (`refunded` when nothing is left, else `partially_refunded`), via `canTransition`. It adds an activity row "Refunded PKR …" and records `refund.created` with the refund object.
  - `toRefundObject(row: RefundRow)`: `{ id, object: 'refund', amount, currency: 'pkr', payment, reason, status, created, livemode: false }`
  - Route: `withApi(…, { idempotent: true })`, then `flushJobsAfterResponse(ctx.merchantId)`; returns 200 with the refund object.

- [ ] **Step 1: Write the failing tests** (payment of 510000 from `makePayment`):
  - PS-RF-001: a full refund → `refunded`, one refund row, one `refund.created`.
  - PS-RF-002: 100000 then 410000 → `partially_refunded`, then `refunded`.
  - PS-RF-003: amount left + 1 → `amount_too_large`.
  - PS-RF-004: exactly the amount left → OK.
  - PS-RF-005: 0, −1 and 0.5 → 400.
  - PS-RF-006: `failed` and `requires_action` → `payment_not_refundable`.
  - PS-RF-007: `disputed` → `payment_disputed`.
  - PS-RF-008: two parallel refunds of 300000 → one succeeds and the other gets `amount_too_large`; `amountRefunded` is 300000.
  - PS-IDEM-008: the same POST twice with one `Idempotency-Key` → one refund row, and the second has `Idempotent-Replayed: true`.
  - Another merchant's payment → 404.
  - The response matches `openapi.yaml#Refund`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(refunds): full and partial refunds with POST /v1/refunds`.

---

### Task 11: Disputes engine, card 0259 and the respond-by deadline

**Files:**
- Create: `apps/web/src/lib/disputes/disputes.ts`
- Modify: `apps/web/src/lib/payments/pay.ts` (`completePayment` enqueues `open_dispute` for `testCard === 'dispute'`), `apps/web/src/lib/jobs/handlers.ts`
- Test: `apps/web/src/lib/disputes/disputes.test.ts`

**Interfaces:**
- Produces:
  - `DISPUTE_RESPOND_DAYS = 7`; `DISPUTE_CARD_DELAY_SECONDS = 60`; `type DisputeRow`
  - `class DisputeError extends Error { code: 'not_found' | 'payment_not_disputable' | 'dispute_exists' | 'dispute_closed' }`
  - `openDispute(db: Db, d: { merchantId: string; paymentId: string; reason: string; now: Date }): Promise<DisputeRow>`. It locks the payment. A dispute already exists → `dispute_exists`. The status is not `succeeded` / `partially_refunded` → `payment_not_disputable`. Otherwise: amount = `amount − amountRefunded`, `previousPaymentStatus` = the current status, payment → `disputed`, `respondBy = now + 7 d`. It adds an activity row, records `dispute.created`, and enqueues `dispute_deadline` at `respondBy`.
  - `closeDispute(db: Db, d: { merchantId: string; disputeId: string; outcome: 'won' | 'lost'; now: Date }): Promise<DisputeRow>`. It locks the dispute and payment. A dispute not in `needs_response` → `dispute_closed`. Won → payment back to `previousPaymentStatus`; lost → `dispute_lost`. It sets `closedAt`, adds an activity row, and records `dispute.closed`.
  - `toDisputeObject(row: DisputeRow)`: `{ id, object: 'dispute', amount, currency: 'pkr', payment, reason, status, respond_by, created, livemode: false }`
  - Job handlers: `openDisputeJob` runs `openDispute(…, reason: 'fraudulent')`. It treats `DisputeError` as `done` (the payment was refunded in full first, or it's already disputed). `disputeDeadlineJob` runs `closeDispute(…, 'lost')` if the dispute is still `needs_response`, and is otherwise a no-op.

- [ ] **Step 1: Write the failing tests:**
  - Paying with card 0259 (through `payCheckoutSession`) enqueues `open_dispute` at +60 s. Running it at +61 s gives `disputed` with one `dispute.created`.
  - PS-DP-002: after a 100000 refund, the dispute amount is 410000.
  - PS-DP-003: won → back to `partially_refunded` (when it was partly refunded), with `dispute.closed` and status `won`.
  - PS-DP-004: lost → `dispute_lost`.
  - PS-DP-005: a second `openDispute` → `dispute_exists`, and a second `closeDispute` → `dispute_closed`; both change nothing.
  - PS-DP-007: the deadline job at +7 d on an open dispute → lost, with `dispute.closed` at that time; on a won dispute it does nothing.
  - Review Focus 3: `createRefund` (full) and `openDisputeJob` run in parallel on one payment. Either the refund succeeds and the dispute job ends `done` with no dispute, or the dispute opens and the refund gets `payment_disputed`. Never both.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; wire both handlers.
- [ ] **Step 4:** Run, then `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(disputes): dispute engine, card 0259 and automatic loss after 7 days`.

---

### Task 12: Webhook endpoint card on the Projects page

**Files:**
- Create: `apps/web/src/app/dashboard/projects/WebhookEndpointCard.tsx`, `apps/web/src/app/dashboard/projects/webhook-actions.ts`, `apps/web/src/lib/webhooks/test-events.ts`
- Modify: `apps/web/src/lib/merchants/merchants.ts`, `apps/web/src/app/dashboard/projects/ProjectsView.tsx`, `apps/web/src/app/dashboard/projects/page.tsx`
- Test: `apps/web/src/lib/webhooks/test-events.test.ts`, `apps/web/e2e/projects.spec.ts` (extend)

**Interfaces:**
- Consumes: Task 4, `recordEvent` (Task 6), `consumeUsage` (Plan 1).
- Produces:
  - `getOwnedMerchant(db: Db, userId: string, merchantId: string): Promise<Merchant | null>`. `rollSecretKeyAction` switches to it.
  - `sendTestEvent(db: Db, merchantId: string, type: EventType, now: Date): Promise<{ ok: true; eventId: string } | { ok: false; reason: 'no_endpoint' | 'daily_limit' }>`. It uses the `test_events` cap and records a real event, with a sample snapshot in the right object shape (IDs like `pay_test0000…`), so it is delivered and signed like any other.
  - Server actions, all returning `{ ok: true, … } | { ok: false, error: string }` and checking ownership first: `saveWebhookEndpointAction(merchantId, url)`, `revealWebhookSecretAction(merchantId)`, `rollWebhookSecretAction(merchantId)`, `reenableWebhookEndpointAction(merchantId)`, `sendTestEventAction(merchantId, type)` (which calls `flushJobsAfterResponse`).
  - UI (shadcn, mobile-first), under each project:
    - a "Webhook endpoint" URL input with a Save button and inline errors (the `EndpointError` message);
    - the signing secret masked as `whsec_••••` with Reveal and Copy, and "Roll secret" behind an AlertDialog;
    - when disabled, a destructive Alert "Disabled after 20 failed events in a row" with "Re-enable";
    - a "Send test event" Select plus Button, disabled with a message at the daily cap.

- [ ] **Step 1: Write the failing tests:** `sendTestEvent` with no endpoint → `no_endpoint`; with one, an event plus a delivery; the 51st on one day → `daily_limit`. E2E (`projects.spec.ts`, desktop): `http://10.0.0.5/x` shows the `url_not_https` message; `http://127.0.0.1:4555/hook` saves (E2E mode); Reveal shows `whsec_`; after Roll, Reveal shows a different `whsec_` value.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit tests and `pnpm --filter web exec playwright test e2e/projects.spec.ts`. Expected: PASS, axe clean.
- [ ] **Step 5:** Commit: `feat(dashboard): webhook endpoint card with secret reveal, roll and test events`.

---

### Task 13: End-to-end webhooks, refunds and the dispute card

**Files:**
- Create: `apps/web/e2e/receiver.ts`, `apps/web/e2e/webhooks.spec.ts`
- Modify: `apps/web/e2e/helpers.ts` (`setEndpointFor(merchantId, url)`, `runJobs(request, advanceSeconds)`), `README.md` (webhooks section: the local receiver needs a tunnel; de-duplicate on `webhook-id`)

**Interfaces:**
- Consumes: `/api/internal/e2e/run-jobs` (Task 8), `setWebhookEndpoint` and `revealWebhookSecret` (Task 4, called from the test process against `DATABASE_URL_E2E` with `allowPrivate: true`).
- Produces: `startReceiver(statuses: number[]): Promise<{ url: string; received: { headers: Record<string, string>; body: string }[]; close(): Promise<void> }>`, a `node:http` server on `127.0.0.1:0`. It answers each request with the next status (the last one repeats).

- [ ] **Step 1: Write the tests:**
  - PS-WH-001 `@smoke`: endpoint set → pay with 4242 in the browser → within 15 s the receiver has one `payment.succeeded` that verifies with `new Webhook(secret).verify(body, headers)`.
  - PS-WH-004: statuses `[500, 200]` → pay → one request (500) → `runJobs(61)` → a second request with the same `webhook-id`.
  - PS-RF-001 `@smoke` (API): pay → `POST /api/v1/refunds` (full, `requested_by_customer`) → 200 `refunded` → the receiver gets `refund.created`.
  - Card 0259: pay → `runJobs(61)` → the receiver gets `dispute.created` with `data.object.amount` 510000.
  Use merchant B for this spec, so the endpoint doesn't affect Plan 1's specs.
- [ ] **Step 2:** Run `pnpm --filter web e2e`. Expected: PASS (all Plan 1 specs too). The mobile project runs only the `@smoke` cases.
- [ ] **Step 3:** Commit: `test(e2e): signed webhooks, retries, refunds and the dispute card`.

---

### Task 14: Deploy to production

**Files:**
- Modify: `docs/superpowers/plans/README.md` (Plan 2 status)

- [ ] **Step 1 [Abdul]:** Create an Upstash account, or add Upstash QStash from the Vercel Marketplace if offered, on the free plan. Check today's free QStash quota and lower `CAPS.webhook_attempts` if one merchant's cap would use most of it. Add `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` to the Vercel project (Production).
- [ ] **Step 2 [Abdul]:** Add `WEBHOOK_SECRET_KEY` (`openssl rand -base64 32`) and `CRON_SECRET` (`openssl rand -hex 32`) in Vercel, typing the values directly into Vercel. **Don't show the output in this session.**
- [ ] **Step 3:** Open the PR `plan-2/webhooks-refunds-disputes` → `main`. CI green, Vercel preview green.
- [ ] **Step 4 [Abdul]:** Approve the merge (it deploys production).
- [ ] **Step 5:** Production check. Abdul points his project's endpoint at a receiver he controls (for example a free `webhook.site` URL he opens himself) and pays with 4242. Expected: a signed `payment.succeeded` arrives within seconds. Then `POST /v1/refunds` (full) → `refund.created`; card 0259 → `dispute.created` about a minute later (via QStash). Check `/api/internal/cron` without the bearer → 401, and `/api/internal/e2e/run-jobs` → 404.
- [ ] **Step 6:** Tag `v0.2.0-plan2`, update the roadmap table, commit `docs: Plan 2 done`.
