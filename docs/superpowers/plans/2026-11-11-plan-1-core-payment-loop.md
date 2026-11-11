# PaySandbox Plan 1: Core Payment Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An invited developer signs in with GitHub, creates a project, gets test API keys, creates a checkout session from their server, and a customer pays it on PaySandbox's hosted checkout with any test card (including OTP), then returns to the merchant's site. All of it is deployed on free Vercel + Neon.

**Architecture:** One Next.js App Router app in a pnpm monorepo (`apps/web`). Public REST API under `/api/v1/*` (API-key auth, idempotency, daily usage caps, request log). Hosted checkout under `/c/[sessionId]` with strict headers and a server-rendered TEST MODE banner. Postgres through Drizzle: `pg` driver in the app and E2E, in-process PGlite in Vitest. Webhook delivery, timers, refunds and the full dashboard come in Plans 2–3; this plan only records events.

**Tech Stack:** Node 24 LTS · pnpm · Next.js (latest stable, App Router, `src/`) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Drizzle ORM + drizzle-kit · `pg` · `@electric-sql/pglite` (tests) · Better Auth (GitHub provider) · zod · Vitest + Testing Library · Playwright + `@axe-core/playwright` · ajv (OpenAPI contract checks) · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-paysandbox-v1-design.md` (copied from `~/paysandbox-mockup/DESIGN.md` in Task 1), plus `…-components.md` and `…-test-plan.md` beside it. Test case IDs like `PS-CG-004` refer to the test plan.

## Global Constraints

- Free tiers only: Vercel Hobby, Neon Free, GitHub public repo. Personal accounts: GitHub `AbdulSubhan1`, Abdul's own Vercel.
- Money is integer **paisa** everywhere (`bigint` in Postgres, `number` in TS, safe below 2^53). Display: `PKR 5,100.00`.
- Currency: `pkr` only (accept `PKR`/`pkr` input, store and return `pkr`).
- Session `amount`: integer, min `100`, max `100000000`. `line_items`: 1–20 items.
- IDs: `prefix_` + 24 random base62 chars. Prefixes: `usr_`, `mer_`, `key_`, `cs_test_`, `pay_`, `cus_`, `evt_`, `act_`, `req_`.
- Keys: publishable `pk_test_` + 24 base62; secret `sk_test_` + 32 base62. Secret stored only as SHA-256 hex, shown once. Rolled secret keeps working 24 h.
- Checkout sessions expire 24 h after creation. Read-time expiry only in this plan; **reads never write**.
- Test cards, outcomes and decline codes exactly as `TEST-PLAN.md` §5. OTP `123456`; 3 wrong codes → failed `authentication_failed`.
- **The CVC never leaves the browser.** Full card numbers, expiry, CVC and OTP codes are never stored, logged or sent to third parties. Store only `card_brand`, `card_last4` and `test_card` (catalogue key).
- **No request bodies are logged anywhere.** No `console.*` in `src/app/c/**`, `src/lib/payments/**`, `src/lib/card-guard/**`.
- Daily caps per merchant (calendar day in `Asia/Karachi`): API requests 1,000 · checkout sessions 200 · webhook attempts 500 · test events 50. Over cap → `429` `daily_limit_reached` with `Retry-After` = seconds to Karachi midnight; refused requests are counted but not written to `api_request_log`.
- Max 3 merchants (projects) per user. Merchant name 2–40 chars, plain text, bank/wallet blocklist.
- Sign-up is invite-only: GitHub login must be in `signup_allowlist`, or the GitHub user ID in `ADMIN_GITHUB_IDS` (comma-separated env var).
- `success_url` / `cancel_url`: `https://…`, or `http://localhost[:port]/…` for local dev.
- API errors: `{ "error": { "type", "code", "message", "param" } }`.
- Idempotency (IETF draft): per merchant, 24 h; replay returns stored status + body + header `Idempotent-Replayed: true`; same key + different request → `422` `idempotency_key_reused`; same key while the first is running → `409` `idempotency_key_in_use`; 5xx responses are not stored.
- Banner text exactly `TEST MODE · no real payments`. Checkout footer exactly `This is a test payment page. Never enter a real card.` + a `Report abuse` mailto link.
- `/c/*` response headers: `Content-Security-Policy` including `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`.
- UI: shadcn/ui on Tailwind with the mockup tokens (`COMPONENTS.md` §3); IBM Plex Sans + IBM Plex Mono via `next/font`. **Mobile-first Tailwind: base classes for mobile, `md:`/`lg:` overrides, never `max-*` variants.**
- Git: conventional commits, one per task step that says Commit. **Never `--no-verify`.**
- Steps marked **[Abdul]** need Abdul to act or approve (creating the GitHub repo, OAuth app, Vercel/Neon projects). Stop and ask; don't do them unasked.

## Review Focus

1. **Pay retried after a network timeout** (Neon wakes up slowly; the browser retries): the customer must not get two payments. The client sends an `attempt_id` per Pay click; the same `attempt_id` returns the same payment. Test in Task 12.
2. **Two tabs open on the same checkout, Pay in both:** only one payment can succeed; the second gets `409 session_complete` or sees the "already paid" page. Test in Task 11.
3. **`success_url` that already has a query string** (`https://shop.test/thanks?ref=ig`): the redirect must be `…/thanks?ref=ig&pay=pay_…`, never `?ref=ig?pay=`. Test in Task 10.
4. **Expiry typed in common formats** (`1/29`, `01/29`, `01 / 29`, `01/2029`): all accepted and normalised; `1/2` or `13/29` give a clear message. Test in Task 4.
5. **Usage counted near midnight:** a request at `2026-11-11T19:30:00Z` (00:30 in Karachi on 12 Nov) counts toward 12 Nov, and `Retry-After` points at the next Karachi midnight, not UTC midnight. Test in Task 8.

---

## File structure

```
paysandbox/
  package.json  pnpm-workspace.yaml  .nvmrc  .github/workflows/ci.yml
  openapi.yaml                                  # public API source of truth (Task 10)
  docs/superpowers/specs/  docs/superpowers/plans/
  apps/web/
    next.config.ts                              # /c/* security headers (Task 13)
    drizzle.config.ts  vitest.config.ts  playwright.config.ts
    drizzle/                                    # generated migrations
    e2e/  global-setup.ts  checkout.spec.ts  api.spec.ts  projects.spec.ts
    src/
      app/
        page.tsx                                # home: sign in with GitHub
        invite-only/page.tsx
        api/auth/[...all]/route.ts
        api/v1/checkout_sessions/route.ts       # POST
        api/v1/checkout_sessions/[id]/route.ts  # GET
        api/v1/payments/route.ts                # GET list
        api/v1/payments/[id]/route.ts           # GET
        c/[sessionId]/layout.tsx  page.tsx  not-found.tsx
        c/[sessionId]/pay/route.ts  c/[sessionId]/otp/route.ts
        dashboard/layout.tsx  dashboard/projects/page.tsx  dashboard/projects/actions.ts
      lib/
        ids.ts  money.ts  time.ts
        card-guard/catalogue.ts  card-guard/guard.ts
        checkout/validate.ts
        db/client.ts  db/schema.ts
        auth/auth.ts  auth/allowlist.ts  auth/session.ts
        merchants/merchants.ts  merchants/names.ts
        keys/keys.ts
        api/errors.ts  api/handler.ts  api/usage.ts  api/request-log.ts
        idempotency/idempotency.ts
        sessions/sessions.ts  sessions/input.ts
        payments/outcome.ts  payments/state.ts  payments/pay.ts  payments/otp.ts  payments/objects.ts
        events/record.ts
      components/
        ui/                                     # shadcn generated
        checkout/TestModeBanner.tsx  CardNumberInput.tsx  CardForm.tsx  TestCardPicker.tsx
                 OrderSummary.tsx  OtpDialog.tsx  PaymentResult.tsx
        common/Money.tsx
      test/db.ts  test/factories.ts  test/seed-e2e.ts
```

---

### Task 1: Repo, workspace and CI skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.nvmrc` (`24`), `.gitignore`, `README.md`, `.github/workflows/ci.yml`
- Create: `apps/web/**` from `create-next-app` (TypeScript, Tailwind, ESLint, App Router, `src/`, import alias `@/*`)
- Create: `apps/web/vitest.config.ts`, `apps/web/src/lib/sanity.test.ts`
- Copy: `~/paysandbox-mockup/DESIGN.md` → `docs/superpowers/specs/2026-11-11-paysandbox-v1-design.md`; `COMPONENTS.md` → `…-components.md`; `TEST-PLAN.md` → `…-test-plan.md`; `index.html` → `docs/mockup/index.html`; `plans/*` → `docs/superpowers/plans/`

**Interfaces:**
- Produces: root scripts `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` (each delegating to `apps/web`); `apps/web` scripts `test` (`vitest run`), `test:watch`, `e2e` (`playwright test`), `typecheck` (`tsc --noEmit`).

- [ ] **Step 1:** Create `~/paysandbox` with the workspace files and `apps/web` via `pnpm create next-app@latest apps/web`. `git init`.
- [ ] **Step 2:** Add Vitest (`environment: 'node'` default, `jsdom` for `*.dom.test.tsx`), and `src/lib/sanity.test.ts` with `it('runs', () => expect(1 + 1).toBe(2))`.
- [ ] **Step 3:** Run `pnpm test`. Expected: 1 passed.
- [ ] **Step 4:** Write `ci.yml`: on `push` and `pull_request`, Node from `.nvmrc`, `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`. (E2E job added in Task 14.)
- [ ] **Step 5:** Copy the docs listed above. Commit: `chore: scaffold monorepo, vitest and CI`.
- [ ] **Step 6 [Abdul]:** Ask Abdul to approve creating the public repo `AbdulSubhan1/paysandbox`; then `gh repo create AbdulSubhan1/paysandbox --public --source . --push`. Expected: CI run green on GitHub.

---

### Task 2: Money, IDs and Karachi time

**Files:**
- Create: `apps/web/src/lib/money.ts`, `ids.ts`, `time.ts`
- Test: `apps/web/src/lib/money.test.ts`, `ids.test.ts`, `time.test.ts`

**Interfaces:**
- Produces:
  - `formatPkr(paisa: number): string`
  - `type IdPrefix = 'usr' | 'mer' | 'key' | 'cs_test' | 'pay' | 'cus' | 'evt' | 'act' | 'req'`; `newId(prefix: IdPrefix): string`; `randomBase62(length: number): string`
  - `karachiDay(now: Date): string` (`YYYY-MM-DD`); `secondsUntilKarachiMidnight(now: Date): number`; `addHours(d: Date, h: number): Date`

- [ ] **Step 1: Write the failing tests**

```ts
// money.test.ts
expect(formatPkr(510000)).toBe('PKR 5,100.00');
expect(formatPkr(100)).toBe('PKR 1.00');
expect(formatPkr(100000000)).toBe('PKR 1,000,000.00');
expect(formatPkr(5)).toBe('PKR 0.05');
expect(() => formatPkr(1.5)).toThrow();          // paisa must be an integer
// ids.test.ts
expect(newId('pay')).toMatch(/^pay_[0-9A-Za-z]{24}$/);
expect(newId('cs_test')).toMatch(/^cs_test_[0-9A-Za-z]{24}$/);
expect(new Set(Array.from({ length: 1000 }, () => newId('evt'))).size).toBe(1000);
// time.test.ts  (Review Focus 5)
expect(karachiDay(new Date('2026-11-11T18:59:59Z'))).toBe('2026-11-11');
expect(karachiDay(new Date('2026-11-11T19:30:00Z'))).toBe('2026-11-12');
expect(secondsUntilKarachiMidnight(new Date('2026-11-11T19:30:00Z'))).toBe(23.5 * 3600);
```

- [ ] **Step 2:** Run `pnpm --filter web test src/lib`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement. `randomBase62` uses `crypto.getRandomValues` with rejection sampling (no modulo bias). Karachi is UTC+5 with no DST; use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' })` for the day.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: money, ids and karachi time helpers`.

---

### Task 3: Test-card catalogue and card guard

The safety core. Shared by the browser input and the server pay route. **100% branch coverage** (enforced in `vitest.config.ts` with a per-directory threshold on `src/lib/card-guard/**`).

**Files:**
- Create: `apps/web/src/lib/card-guard/catalogue.ts`, `guard.ts`
- Test: `apps/web/src/lib/card-guard/guard.test.ts`
- Modify: `apps/web/vitest.config.ts` (coverage thresholds)

**Interfaces:**
- Produces:
  - `type CardBrand = 'visa' | 'mastercard'`
  - `type TestCardOutcome = 'succeeded' | 'three_ds' | 'dispute' | 'insufficient_funds' | 'expired_card' | 'generic_decline' | 'incorrect_cvc' | 'processing_error'`
  - `interface TestCard { key: string; number: string; brand: CardBrand; outcome: TestCardOutcome; title: string; description: string; showInCheckout: boolean }`
  - `TEST_CARDS: readonly TestCard[]` (the 9 cards, `TEST-PLAN.md` §5; `showInCheckout` true for 4242, 9995, 3220, 0069)
  - `normalizeDigits(raw: string): string`: keeps ASCII `0-9` only, max 16
  - `type GuardResult = { state: 'empty' } | { state: 'partial'; brand: CardBrand | null } | { state: 'complete'; card: TestCard } | { state: 'refused' }`
  - `guardCardInput(raw: string): GuardResult`
  - `findTestCard(raw: string): TestCard | null` (exact 16-digit match only)

- [ ] **Step 1: Write the failing tests** (PS-CG-001…009)

```ts
expect(guardCardInput('4242 4242 4242 4242')).toEqual({ state: 'complete', card: expect.objectContaining({ key: 'visa_success' }) });
expect(guardCardInput('5398')).toEqual({ state: 'refused' });                  // CG-002
expect(guardCardInput('539')).toEqual({ state: 'partial', brand: null });      // CG-003: <4 digits, no error yet
expect(guardCardInput('5398-2283-4729-1056')).toEqual({ state: 'refused' });   // CG-004/005
expect(guardCardInput('4242 4243')).toEqual({ state: 'refused' });             // CG-006
expect(guardCardInput('424242424242424')).toEqual({ state: 'partial', brand: 'visa' }); // CG-007: 15 digits
expect(normalizeDigits('42424242424242421234')).toHaveLength(16);              // CG-008
expect(normalizeDigits('٤٢٤٢ abc 😀')).toBe('');                                // CG-009: non-ASCII digits dropped
expect(guardCardInput('')).toEqual({ state: 'empty' });
expect(findTestCard('4000 0000 0000 3220')?.outcome).toBe('three_ds');
expect(findTestCard('4111111111111111')).toBeNull();
expect(findTestCard('4242')).toBeNull();
expect(TEST_CARDS).toHaveLength(9);
expect(new Set(TEST_CARDS.map(c => c.number)).size).toBe(9);
```

- [ ] **Step 2:** Run `pnpm --filter web test src/lib/card-guard`. Expected: FAIL.
- [ ] **Step 3:** Implement. Rule: `refused` when `digits.length >= 4` and no catalogue number starts with `digits`; `partial` while some card starts with `digits` (brand = that card's brand, or `null` below 4 digits with no match); `complete` on an exact 16-digit match.
- [ ] **Step 4:** Run with coverage: `pnpm --filter web test --coverage src/lib/card-guard`. Expected: PASS, 100% branches.
- [ ] **Step 5:** Commit `feat: test-card catalogue and card guard`.

---

### Task 4: Checkout field validation

Shared by the card form (browser) and the pay route (server), except CVC, which is browser-only.

**Files:**
- Create: `apps/web/src/lib/checkout/validate.ts`
- Test: `apps/web/src/lib/checkout/validate.test.ts`

**Interfaces:**
- Produces:
  - `parseExpiry(raw: string, now: Date): { ok: true; month: number; year: number } | { ok: false; message: string }`
  - `validateEmail(raw: string): string | null` (error message or null)
  - `validateCvc(raw: string): string | null`
  - `validateName(raw: string): string | null` (1–100 chars after trim)
  - `EXPIRY_MESSAGES = { format: 'Enter the expiry date as MM / YY.', month: 'Enter a month from 01 to 12.', past: 'This expiry date is in the past.', far: 'Enter a real expiry year.' }`

- [ ] **Step 1: Write the failing tests** (PS-FV-001…008, Review Focus 4). Fix `now = new Date('2026-11-11T10:00:00Z')`.

```ts
for (const raw of ['1/29', '01/29', '01 / 29', '01/2029', '0129'])
  expect(parseExpiry(raw, now)).toEqual({ ok: true, month: 1, year: 2029 });
expect(parseExpiry('11/26', now)).toMatchObject({ ok: true });                 // current month OK
expect(parseExpiry('10/26', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.past });
expect(parseExpiry('13/29', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.month });
expect(parseExpiry('00/29', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.month });
expect(parseExpiry('12/47', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.far });  // > 20 years
expect(parseExpiry('1/2', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.format });
expect(validateEmail('')).toBe('Enter your email.');
expect(validateEmail('ayesha@')).toBe('Enter a valid email, like name@example.com.');
expect(validateEmail('ayesha@example.com')).toBeNull();
expect(validateCvc('12')).not.toBeNull(); expect(validateCvc('123')).toBeNull(); expect(validateCvc('1234')).not.toBeNull();
expect(validateName('  ')).toBe('Enter the name on the card.');
expect(validateName('عائشہ خان')).toBeNull();
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: checkout field validation`.

---

### Task 5: Database schema and client

**Files:**
- Create: `apps/web/src/lib/db/schema.ts`, `client.ts`, `apps/web/drizzle.config.ts`, `apps/web/drizzle/*` (generated)
- Create: `apps/web/src/test/db.ts` (PGlite test DB), `apps/web/src/test/factories.ts`
- Test: `apps/web/src/lib/db/schema.test.ts`
- Modify: `apps/web/package.json` scripts `db:generate`, `db:migrate`

**Interfaces:**
- Produces:
  - Drizzle tables (columns per DESIGN §5, money as `bigint({ mode: 'number' })`, timestamps `timestamp with time zone`): `users` (Better Auth `user` table + `githubUserId`, `githubLogin`, `isAdmin`), Better Auth `session`/`account`/`verification`, `signupAllowlist`, `merchants` (+ `isGuest`, `guestExpiresAt`, `demoReceiverMode` nullable for Plan 4), `apiKeys`, `checkoutSessions`, `payments` (+ `attemptId`, unique `(checkoutSessionId, attemptId)`), `paymentActivity`, `customers` (unique `(merchantId, email)`), `events`, `idempotencyKeys` (PK `(merchantId, key)`), `apiRequestLog`, `usageDaily` (PK `(merchantId, day)`).
  - Enums: `paymentStatus` = `requires_action | succeeded | failed | partially_refunded | refunded | disputed | dispute_lost`; `sessionStatus` = `open | complete | expired`.
  - `type Db` (a `PgDatabase` usable by both drivers); `getDb(): Db`, reading `DATABASE_URL` (`pglite:` → PGlite, otherwise `pg` Pool with `max: 5`).
  - Test helpers: `createTestDb(): Promise<Db>` (fresh in-memory PGlite with migrations applied); factories `makeUser(db)`, `makeMerchant(db, { userId?, name? })`, `makeSession(db, merchantId, overrides?)`.

- [ ] **Step 1: Write the failing test**

```ts
const db = await createTestDb();
const m = await makeMerchant(db);
const s = await makeSession(db, m.id, { amount: 510000 });
expect(s.amount).toBe(510000);
expect(s.status).toBe('open');
await expect(db.insert(customers).values([{ id: newId('cus'), merchantId: m.id, email: 'a@x.pk' }, { id: newId('cus'), merchantId: m.id, email: 'a@x.pk' }])).rejects.toThrow(); // unique per merchant
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Generate the Better Auth tables with `npx @better-auth/cli generate` (Drizzle output), merge into `schema.ts`, add the rest, `pnpm --filter web db:generate`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: database schema, drizzle client and test db`.

---

### Task 6: Invite-only GitHub login

**Files:**
- Create: `apps/web/src/lib/auth/auth.ts`, `allowlist.ts`, `session.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/invite-only/page.tsx`
- Test: `apps/web/src/lib/auth/allowlist.test.ts`

**Interfaces:**
- Consumes: `getDb`, `signupAllowlist`, `users` (Task 5).
- Produces:
  - `isAllowedToSignUp(profile: { githubId: string; login: string; email?: string }, deps: { adminIds: string[]; isAllowlisted: (login: string) => Promise<boolean>; e2eMode: boolean }): Promise<boolean>`
  - `auth` (Better Auth instance, GitHub provider, `mapProfileToUser` stores `githubUserId` + `githubLogin`; `databaseHooks.user.create.before` returns `false` when `isAllowedToSignUp` is false, and the error redirect goes to `/invite-only`)
  - `requireUser(): Promise<{ id: string; githubLogin: string; isAdmin: boolean }>` (redirects to `/` when logged out)
  - **E2E mode:** when `E2E_AUTH_BYPASS === '1'` **and** `process.env.VERCEL` is unset, Better Auth also enables `emailAndPassword`, and `isAllowedToSignUp` accepts emails ending `@e2e.test`. In every other case email/password is off.

- [ ] **Step 1: Write the failing tests** (PS-AUTH-012/013)

```ts
const deps = (list: string[], e2eMode = false) => ({ adminIds: ['1001'], isAllowlisted: async (l: string) => list.includes(l), e2eMode });
expect(await isAllowedToSignUp({ githubId: '1001', login: 'AbdulSubhan1' }, deps([]))).toBe(true);   // admin
expect(await isAllowedToSignUp({ githubId: '2', login: 'stranger' }, deps([]))).toBe(false);
expect(await isAllowedToSignUp({ githubId: '3', login: 'friend' }, deps(['friend']))).toBe(true);
expect(await isAllowedToSignUp({ githubId: '3', login: 'Friend' }, deps(['friend']))).toBe(true);    // GitHub logins are case-insensitive
expect(await isAllowedToSignUp({ githubId: '4', login: 'x', email: 'qa@e2e.test' }, deps([], false))).toBe(false);
expect(await isAllowedToSignUp({ githubId: '4', login: 'x', email: 'qa@e2e.test' }, deps([], true))).toBe(true);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `allowlist.ts`, then `auth.ts`, the route and pages. `/` shows "Sign in with GitHub"; `/invite-only` shows `PaySandbox is invite-only for now.` + `Request access` (mailto Abdul). Store allowlist logins lowercase.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: invite-only github login`.
- [ ] **Step 6 [Abdul]:** Ask Abdul to create a GitHub OAuth app (callback `http://localhost:3000/api/auth/callback/github`) and put `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `ADMIN_GITHUB_IDS` in `apps/web/.env.local`. Manual check: Abdul signs in; a non-allowlisted account lands on `/invite-only` and no `users` row is created.

---

### Task 7: Projects (merchants) and API keys

**Files:**
- Create: `apps/web/src/lib/merchants/names.ts`, `merchants.ts`, `apps/web/src/lib/keys/keys.ts`
- Create: `apps/web/src/app/dashboard/layout.tsx`, `dashboard/projects/page.tsx`, `dashboard/projects/actions.ts`
- Test: `apps/web/src/lib/merchants/merchants.test.ts`, `apps/web/src/lib/keys/keys.test.ts`

**Interfaces:**
- Consumes: `newId`, `randomBase62`, `addHours` (Task 2); `Db`, factories (Task 5); `requireUser` (Task 6).
- Produces:
  - `validateMerchantName(raw: string): string | null`, `NAME_BLOCKLIST: readonly string[]` (at least: `hbl, habib bank, ubl, united bank, meezan, mcb, allied bank, alfalah, standard chartered, faysal, askari, bank islami, jazzcash, easypaisa, sadapay, nayapay, raast, 1link, paypal, stripe`; matched case-insensitively as whole words)
  - `createMerchant(db: Db, userId: string, name: string): Promise<{ merchant: Merchant; publishableKey: string; secretKey: string }>` (throws `MerchantLimitError` at 3)
  - `listMerchants(db: Db, userId: string): Promise<Merchant[]>`
  - `hashKey(key: string): string` (SHA-256 hex)
  - `rollSecretKey(db: Db, merchantId: string, now: Date): Promise<string>` (old key gets `expiresAt = now + 24h`)
  - `findMerchantBySecretKey(db: Db, key: string, now: Date): Promise<string | null>` (merchant ID; ignores expired keys)
  - Projects page: list projects (name, publishable key, `sk_test_…` + last 4), "New project" form, "Roll secret key" button with a confirm dialog. The full secret is shown **once** in a dialog after create or roll, with Copy.

- [ ] **Step 1: Write the failing tests** (PS-AUTH-007/014, PS-DEV-003, PS-CG-013 spirit)

```ts
expect(validateMerchantName('Chai Code Co.')).toBeNull();
expect(validateMerchantName('C')).not.toBeNull();
expect(validateMerchantName('x'.repeat(41))).not.toBeNull();
expect(validateMerchantName('HBL Payments')).not.toBeNull();
expect(validateMerchantName('Shubleen Crafts')).toBeNull();       // 'hbl' inside a word is fine
const { merchant, publishableKey, secretKey } = await createMerchant(db, user.id, 'Chai Code Co.');
expect(publishableKey).toMatch(/^pk_test_[0-9A-Za-z]{24}$/);
expect(secretKey).toMatch(/^sk_test_[0-9A-Za-z]{32}$/);
const rows = await db.select().from(apiKeys).where(eq(apiKeys.merchantId, merchant.id));
expect(JSON.stringify(rows)).not.toContain(secretKey);            // only the hash is stored
expect(await findMerchantBySecretKey(db, secretKey, now)).toBe(merchant.id);
await createMerchant(db, user.id, 'Two'); await createMerchant(db, user.id, 'Three');
await expect(createMerchant(db, user.id, 'Four')).rejects.toBeInstanceOf(MerchantLimitError);
const fresh = await rollSecretKey(db, merchant.id, now);
expect(await findMerchantBySecretKey(db, secretKey, addHours(now, 23))).toBe(merchant.id);   // grace period
expect(await findMerchantBySecretKey(db, secretKey, addHours(now, 25))).toBeNull();
expect(await findMerchantBySecretKey(db, fresh, addHours(now, 25))).toBe(merchant.id);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the libs, then the page and server actions with shadcn `Card`, `Button`, `Input`, `Field`, `Dialog`, `AlertDialog`, `InputGroup` (run `pnpm dlx shadcn@latest init` and `add` here; set the mockup tokens in `globals.css` per `COMPONENTS.md` §3).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: projects and api keys`.

---

### Task 8: API core: errors, key auth, daily caps, request log

**Files:**
- Create: `apps/web/src/lib/api/errors.ts`, `usage.ts`, `request-log.ts`, `handler.ts`
- Test: `apps/web/src/lib/api/usage.test.ts`, `handler.test.ts`

**Interfaces:**
- Consumes: `findMerchantBySecretKey` (Task 7), `karachiDay`, `secondsUntilKarachiMidnight`, `newId` (Task 2).
- Produces:
  - `class ApiError extends Error { constructor(status: number, type: 'invalid_request_error' | 'authentication_error' | 'rate_limit_error' | 'idempotency_error' | 'api_error', code: string, message: string, param?: string) }`; `errorBody(e: ApiError)`
  - `CAPS = { api_requests: 1000, checkout_sessions: 200, webhook_attempts: 500, test_events: 50 } as const`; `type UsageCounter = keyof typeof CAPS`
  - `consumeUsage(db: Db, merchantId: string, counter: UsageCounter, now: Date): Promise<{ allowed: boolean; used: number; cap: number; retryAfterSeconds: number }>` (one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`)
  - `authenticateRequest(db: Db, authorization: string | null, now: Date): Promise<string>` (merchant ID). Accepts `Bearer sk_test_…` and HTTP Basic with the key as username. Throws `ApiError(401, 'authentication_error', 'invalid_api_key', …)` with these messages: missing → `No API key provided.`; `pk_test_` → `A publishable key can't be used here. Use your secret key (sk_test_…) on your server.`; `sk_live_`/`pk_live_` → `PaySandbox has no live mode. Use your sk_test_ key.`; unknown/expired → `Invalid API key.`
  - `type ApiResponse = { status: number; body: unknown; headers?: Record<string, string> }`
  - `type ApiContext = { db: Db; merchantId: string; now: Date; requestId: string; idempotencyKey: string | null }`
  - `withApi(handler: (ctx: ApiContext, req: Request, params: Record<string, string>) => Promise<ApiResponse>, opts?: { idempotent?: boolean }): (req: Request, route: { params: Promise<Record<string, string>> }) => Promise<Response>`. Order: auth → `consumeUsage('api_requests')` (refused → 429, **not** logged) → idempotency (Task 9, when `opts.idempotent`) → handler → `logApiRequest` (method, path, status, idempotency key, error code, duration; no bodies). `ApiError` → its status + `errorBody`; anything else → 500 `api_error`.

- [ ] **Step 1: Write the failing tests** (PS-AUTH-001…004, 010; Review Focus 5)

```ts
// usage.test.ts
for (let i = 0; i < 1000; i++) expect((await consumeUsage(db, m.id, 'api_requests', now)).allowed).toBe(true);
const over = await consumeUsage(db, m.id, 'api_requests', now);
expect(over).toMatchObject({ allowed: false, used: 1001, cap: 1000 });
const late = new Date('2026-11-11T19:30:00Z');                       // 00:30 Karachi, 12 Nov
expect((await consumeUsage(db, m.id, 'api_requests', late)).used).toBe(1);   // new day
// handler.test.ts (call the wrapped handler with a Request)
expect((await call({ auth: null })).status).toBe(401);
expect((await call({ auth: `Bearer ${pk}` })).json.error.message).toMatch(/publishable key/);
expect((await call({ auth: 'Bearer sk_live_abc' })).json.error.message).toMatch(/no live mode/);
expect((await call({ auth: basic(sk) })).status).toBe(200);
// after 1,000 calls: 1,001st → 429, Retry-After header numeric, and api_request_log has exactly 1,000 rows
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: api core with key auth, daily caps and request log`.

---

### Task 9: Idempotency

**Files:**
- Create: `apps/web/src/lib/idempotency/idempotency.ts`
- Modify: `apps/web/src/lib/api/handler.ts` (call it when `opts.idempotent`)
- Test: `apps/web/src/lib/idempotency/idempotency.test.ts`

**Interfaces:**
- Consumes: `ApiError`, `ApiResponse` (Task 8).
- Produces: `withIdempotency(db: Db, args: { merchantId: string; key: string | null; method: string; path: string; body: unknown; now: Date }, run: () => Promise<ApiResponse>): Promise<ApiResponse>`. `key === null` → just `run()`. Key must be 1–255 chars, else `ApiError(400, 'invalid_request_error', 'idempotency_key_invalid')`. Request hash = SHA-256 of `method + ' ' + path + ' ' + canonicalJson(body)` (keys sorted). Claim with `INSERT … ON CONFLICT DO NOTHING` as `in_progress`; rows older than 24 h are treated as absent (overwritten). Replay adds header `Idempotent-Replayed: true`.

- [ ] **Step 1: Write the failing tests** (PS-IDEM-001, 002, 004, 005, 006, 007)

```ts
let calls = 0; const run = async () => ({ status: 200, body: { id: `cs_${++calls}` } });
const a = await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
const b = await withIdempotency(db, args('order_1042', { amount: 510000 }), run);
expect(b.body).toEqual(a.body); expect(b.headers?.['Idempotent-Replayed']).toBe('true'); expect(calls).toBe(1);
await expect(withIdempotency(db, args('order_1042', { amount: 1 }), run)).rejects.toMatchObject({ status: 422, code: 'idempotency_key_reused' });
expect((await withIdempotency(db, { ...args('order_1042', { amount: 510000 }), merchantId: other.id }, run)).body).toEqual({ id: 'cs_2' }); // per merchant
expect((await withIdempotency(db, { ...args('order_1042', { amount: 510000 }), now: addHours(now, 25) }, run)).body).toEqual({ id: 'cs_3' }); // expired
// a run that throws a plain Error (→ 500) leaves no row: the same key runs again next time
// a run returning { status: 400 } is stored and replayed
// in-progress row (insert one manually with status 'in_progress') → 409 idempotency_key_in_use
await expect(withIdempotency(db, args('x'.repeat(256), {}), run)).rejects.toMatchObject({ status: 400 });
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; wire into `withApi`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: idempotency keys per ietf draft`.

---

### Task 10: Checkout sessions API and OpenAPI contract

**Files:**
- Create: `apps/web/src/lib/sessions/input.ts`, `sessions.ts`, `apps/web/src/app/api/v1/checkout_sessions/route.ts`, `[id]/route.ts`, `openapi.yaml`
- Test: `apps/web/src/lib/sessions/sessions.test.ts`, `apps/web/src/app/api/v1/checkout_sessions/route.test.ts`, `apps/web/src/test/openapi.ts` (helper: `expectMatchesSchema(schemaName: string, body: unknown)` using ajv on `openapi.yaml` components)

**Interfaces:**
- Consumes: `withApi`, `ApiError`, `consumeUsage('checkout_sessions')` (Task 8); `newId`, `addHours` (Task 2).
- Produces:
  - `CreateSessionInput` (zod): `amount` int 100…100000000; `currency` `pkr` case-insensitive; `line_items` 1–20 of `{ name: string 1–200, quantity: int 1–1000, amount: int ≥ 0 }`; `success_url`, `cancel_url` (https, or http on `localhost`/`127.0.0.1`); `customer_email?` (valid email). Errors → `ApiError(400, 'invalid_request_error', <code>, <message>, <param>)` with codes `amount_too_small`, `amount_too_large`, `amount_not_integer`, `currency_not_supported`, `parameter_missing`, `parameter_invalid`.
  - `createCheckoutSession(ctx: ApiContext, input: CreateSessionInput): Promise<CheckoutSessionRow>`
  - `getCheckoutSession(db: Db, merchantId: string, id: string): Promise<CheckoutSessionRow | null>` (other merchant → `null` → route returns 404 `resource_missing`)
  - `getSessionForCheckout(db: Db, id: string): Promise<(CheckoutSessionRow & { merchantName: string }) | null>` (by ID only, for the hosted page: the session ID is the capability)
  - `effectiveSessionStatus(row: CheckoutSessionRow, now: Date): 'open' | 'complete' | 'expired'` (read-time expiry; no writes)
  - `toSessionObject(row, now: Date)`: `{ id, object: 'checkout_session', url, amount, currency: 'pkr', line_items, customer_email, success_url, cancel_url, status, payment, expires_at, created, livemode: false }` (times as unix seconds; `url = ${APP_URL}/c/${id}`)
  - `buildReturnUrl(successUrl: string, paymentId: string): string` (uses `URL.searchParams.set('pay', id)`)
  - `openapi.yaml` (3.1): `POST/GET` checkout sessions, `GET` payments list + item, schemas `CheckoutSession`, `Payment`, `PaymentList`, `Error`.

- [ ] **Step 1: Write the failing tests** (PS-CS-001…008, PS-AUTH-005/011, PS-IDEM-001 via HTTP, Review Focus 3)

```ts
expect(buildReturnUrl('https://shop.test/thanks?ref=ig', 'pay_1')).toBe('https://shop.test/thanks?ref=ig&pay=pay_1');
const ok = await post({ amount: 510000, currency: 'PKR', line_items: [{ name: 'Hoodie', quantity: 1, amount: 510000 }], success_url: 'https://my-store.test/thanks', cancel_url: 'https://my-store.test/cart' });
expect(ok.status).toBe(200); expectMatchesSchema('CheckoutSession', ok.json);
expect(ok.json).toMatchObject({ currency: 'pkr', status: 'open', livemode: false, url: expect.stringMatching(/\/c\/cs_test_/) });
expect(ok.json.expires_at - ok.json.created).toBe(24 * 3600);
expect((await post({ ...valid, amount: 99 })).json.error.code).toBe('amount_too_small');
expect((await post({ ...valid, amount: 100 })).status).toBe(200);
expect((await post({ ...valid, amount: 100000001 })).json.error.code).toBe('amount_too_large');
expect((await post({ ...valid, amount: 5100.5 })).json.error.code).toBe('amount_not_integer');
expect((await post({ ...valid, amount: '5100' })).json.error.code).toBe('amount_not_integer');
expect((await post({ ...valid, currency: 'usd' })).json.error.code).toBe('currency_not_supported');
expect((await post({ ...valid, success_url: 'http://evil.test/x' })).json.error.param).toBe('success_url');
expect((await post({ ...valid, success_url: 'http://localhost:3000/thanks' })).status).toBe(200);
expect((await post({ ...valid, line_items: Array(21).fill(item) })).json.error.param).toBe('line_items');
expect((await getAs(merchantB, ok.json.id)).status).toBe(404);                       // AUTH-005
// 201st session in a Karachi day → 429 daily_limit_reached (AUTH-011)
// row with expires_at in the past: GET returns status 'expired' and the DB row still says 'open'
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement input schema, lib, routes (POST with `withApi(…, { idempotent: true })`), `openapi.yaml`, ajv helper.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: checkout sessions api with openapi contract`.

---

### Task 11: Payment engine (outcomes, states, pay, OTP, events)

**Files:**
- Create: `apps/web/src/lib/payments/outcome.ts`, `state.ts`, `pay.ts`, `otp.ts`, `objects.ts`, `apps/web/src/lib/events/record.ts`
- Test: `apps/web/src/lib/payments/state.test.ts`, `pay.test.ts`, `otp.test.ts`

**Interfaces:**
- Consumes: `findTestCard` (Task 3), `parseExpiry`, `validateEmail`, `validateName` (Task 4), `effectiveSessionStatus` (Task 10), `newId` (Task 2).
- Produces:
  - `DECLINES: Record<'insufficient_funds' | 'expired_card' | 'generic_decline' | 'incorrect_cvc' | 'processing_error' | 'authentication_failed', { code: string; declineCode: string | null; message: string }>` (codes and messages as `TEST-PLAN.md` §2.6 and the mockup)
  - `decideOutcome(card: TestCard): { kind: 'succeeded' } | { kind: 'requires_action' } | { kind: 'failed'; decline: keyof typeof DECLINES }` (`dispute` → succeeded; Plan 2 opens the dispute)
  - `type PaymentStatus` (as enum, Task 5); `canTransition(from: PaymentStatus | null, to: PaymentStatus): boolean` with the design §6 graph (`null` = new payment; Plan 1 uses `null→succeeded|failed|requires_action`, `requires_action→succeeded|failed`; the refund/dispute edges are defined now and tested now)
  - `type EventType = 'payment.succeeded' | 'payment.failed' | 'payment.requires_action' | 'refund.created' | 'dispute.created' | 'dispute.closed'`; `recordEvent(tx: Db, e: { merchantId: string; type: EventType; payload: object; now: Date }): Promise<string>` (inserts into `events`; delivery is Plan 2)
  - `toPaymentObject(row: PaymentRow, customer: CustomerRow)`: `{ id, object: 'payment', amount, amount_refunded, currency: 'pkr', status, customer: { id, name, email }, card: { brand, last4 }, failure_code, decline_code, checkout_session, created, livemode: false }`
  - `type PayInput = { sessionId: string; attemptId: string; email: string; name: string; cardNumber: string; expiry: string }` (**no CVC**)
  - `type PayResult = { status: 'succeeded' | 'requires_action' | 'failed'; paymentId: string; failure?: { code: string; declineCode: string | null; message: string }; returnUrl?: string }`
  - `class PayError extends Error { code: 'card_not_test_card' | 'session_not_found' | 'session_expired' | 'session_complete' | 'payment_in_progress' | 'invalid_field'; field?: string }`
  - `payCheckoutSession(db: Db, input: PayInput, now: Date): Promise<PayResult>`. One transaction: `SELECT … FOR UPDATE` the session; reject if not `open` (effective status) or if it has a `succeeded` or `requires_action` payment; same `(sessionId, attemptId)` already exists → return that payment's result unchanged; upsert customer by `(merchantId, lower(email))`; insert payment with `card_brand`, `card_last4`, `test_card` only; `payment_activity` rows (`Checkout session created` is written at session creation; here `Customer submitted card`, then `Authorized by Sandbox Bank` + `Payment succeeded`, or `OTP requested (3-D Secure)`, or `Payment failed`); on success set session `complete` + `paymentId`; `recordEvent` with the matching type. **No logging of `input`.**
  - `submitOtp(db: Db, args: { sessionId: string; paymentId: string; code: string } | { sessionId: string; paymentId: string; cancel: true }, now: Date): Promise<PayResult>`. `123456` → succeeded; wrong → `otp_attempts + 1`, failing on the 3rd; cancel → failed `authentication_failed`.

- [ ] **Step 1: Write the failing tests** (PS-CO-001…009, PS-3DS-001…006, PS-CG-012/013, PS-RD-003, Review Focus 2)

```ts
// state.test.ts
expect(canTransition(null, 'succeeded')).toBe(true);
expect(canTransition('requires_action', 'succeeded')).toBe(true);
expect(canTransition('failed', 'refunded')).toBe(false);
expect(canTransition('refunded', 'partially_refunded')).toBe(false);
expect(canTransition('disputed', 'dispute_lost')).toBe(true);
// pay.test.ts: table over all 9 cards
it.each([
  ['4242424242424242', 'succeeded', null],
  ['5555555555554444', 'succeeded', null],
  ['4000000000009995', 'failed', 'insufficient_funds'],
  ['4000000000000069', 'failed', 'expired_card'],
  ['4000000000000002', 'failed', 'generic_decline'],
  ['4000000000000127', 'failed', 'incorrect_cvc'],
  ['4000000000000119', 'failed', 'processing_error'],
  ['4000000000003220', 'requires_action', null],
  ['4000000000000259', 'succeeded', null],
])('card %s → %s', async (card, status, decline) => { /* pay, assert result.status, failure code, event type in events table */ });
await expect(pay({ cardNumber: '5398228347291056' })).rejects.toMatchObject({ code: 'card_not_test_card' });   // CG-012
const row = (await db.select().from(payments))[0];
expect(JSON.stringify(row)).not.toMatch(/4242424242424242|12\/29|123/);                               // CG-013
// declined then 4242 on the same session → succeeded; both payments kept (CO-009)
// same attemptId twice → same paymentId, one row (Review Focus 1, engine level)
// two different attemptIds after success → second rejects session_complete (Review Focus 2)
// success: result.returnUrl === buildReturnUrl(session.successUrl, paymentId)
// otp.test.ts: '123456' → succeeded + payment.succeeded event; '000000' ×3 → failed authentication_failed on 3rd; cancel → failed
// expired session (expires_at past) → PayError session_expired
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: payment engine with test-card outcomes and otp`.

---

### Task 12: Checkout routes and payments read API

**Files:**
- Create: `apps/web/src/app/c/[sessionId]/pay/route.ts`, `otp/route.ts`, `apps/web/src/app/api/v1/payments/route.ts`, `[id]/route.ts`
- Test: `apps/web/src/app/c/[sessionId]/pay/route.test.ts`, `apps/web/src/app/api/v1/payments/route.test.ts`

**Interfaces:**
- Consumes: `payCheckoutSession`, `submitOtp`, `PayError`, `toPaymentObject` (Task 11); `withApi` (Task 8).
- Produces:
  - `POST /c/[sessionId]/pay` body `{ attempt_id: uuid, email, name, card_number, expiry }` → `200 { status, payment_id, failure?, return_url? }`; `PayError` → `400`/`409`/`410` `{ error: { code, message, field? } }` (`card_not_test_card` 400, `invalid_field` 400, `session_complete` 409, `payment_in_progress` 409, `session_expired` 410, `session_not_found` 404). Rejects bodies containing a `cvc` key with 400 `cvc_not_accepted` (the browser must never send it). Responses carry `Cache-Control: no-store`.
  - `POST /c/[sessionId]/otp` body `{ payment_id, code }` or `{ payment_id, cancel: true }` → same response shape.
  - `GET /api/v1/payments?limit&starting_after` → `{ object: 'list', data: Payment[], has_more }` (newest first, `limit` 1–100, default 10); `GET /api/v1/payments/[id]` → `Payment` or 404.

- [ ] **Step 1: Write the failing tests** (Review Focus 1, PS-CG-010/012, PS-AUTH-005)

```ts
const spy = vi.spyOn(console, 'log'); const err = vi.spyOn(console, 'error');
const r = await postPay(session.id, { ...valid, card_number: '5398228347291056' });
expect(r.status).toBe(400); expect(r.json.error.code).toBe('card_not_test_card');
expect(JSON.stringify([...spy.mock.calls, ...err.mock.calls])).not.toContain('5398');                  // nothing logged
expect((await postPay(session.id, { ...valid, cvc: '123' })).json.error.code).toBe('cvc_not_accepted');
const first = await postPay(session.id, { ...valid, attempt_id: A });
const retry = await postPay(session.id, { ...valid, attempt_id: A });                                  // timeout retry
expect(retry.json.payment_id).toBe(first.json.payment_id);
expect((await postPay(session.id, { ...valid, attempt_id: B })).status).toBe(409);
const list = await getPayments(merchantA, '?limit=1');
expectMatchesSchema('PaymentList', list.json); expect(list.json.data).toHaveLength(1);
expect((await getPayment(merchantB, first.json.payment_id)).status).toBe(404);
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: checkout pay/otp routes and payments read api`.

---

### Task 13: Hosted checkout page

**Files:**
- Create: `apps/web/src/app/c/[sessionId]/layout.tsx`, `page.tsx`, `not-found.tsx`
- Create: `apps/web/src/components/checkout/TestModeBanner.tsx`, `OrderSummary.tsx`, `CardNumberInput.tsx`, `CardForm.tsx`, `TestCardPicker.tsx`, `OtpDialog.tsx`, `PaymentResult.tsx`, `apps/web/src/components/common/Money.tsx`
- Modify: `apps/web/next.config.ts` (headers for `/c/:path*`)
- Test: `apps/web/src/components/checkout/CardNumberInput.dom.test.tsx`, `CardForm.dom.test.tsx`, `OtpDialog.dom.test.tsx`

**Interfaces:**
- Consumes: `getSessionForCheckout`, `effectiveSessionStatus`, `buildReturnUrl` (Task 10); `guardCardInput`, `TEST_CARDS` (Task 3); validators (Task 4); the pay/otp routes (Task 12); shadcn `Card`, `Button`, `Spinner`, `Field`, `Input`, `InputGroup`, `InputOTP`, `Dialog`, `Alert`.
- Produces:
  - Layout: `TestModeBanner` at the top (sticky, hazard-tape style from the mockup, text `TEST MODE · no real payments`), footer copy per Global Constraints. Nothing from the merchant or the URL can affect either.
  - Page states: `open` → `OrderSummary` + `CardForm` + `TestCardPicker`; `complete` → "Already paid" + link to `buildReturnUrl`; `expired` → "This checkout has expired" + link to `cancel_url`; unknown ID → `not-found.tsx` (no merchant data). "← Back to store" links to `cancel_url`.
  - `CardNumberInput` props `{ onChange(result: GuardResult): void }`. Holds digits only in the DOM input, never in React state or props after refusal; on `refused` clears the input and shows the refusal message in an `aria-live="assertive"` region tied via `aria-describedby`. `autocomplete="off"`, `inputMode="numeric"`, label `Card information`.
  - `CardForm`: email, card number, expiry (auto-formats `MM / YY`), CVC (`inputMode="numeric"`, 3 digits, **validated locally and never included in the request**), name. On Pay: validate, focus first invalid field, generate one `attempt_id` per click (`crypto.randomUUID()`), disable the button with `Spinner` and "Processing…", POST, then show `OtpDialog` or `PaymentResult`.
  - `OtpDialog` (shadcn Dialog + InputOTP): labelled, focus trapped, Enter verifies, Esc cancels (= cancel request), focus returns to the result heading.
  - `PaymentResult`: success (amount, payment ID, "Return to {merchant}" → `return_url`) or declined (message, `code · decline_code`, "Try another card" resets the form).
  - Headers in `next.config.ts` for `/c/:path*` exactly as Global Constraints.

- [ ] **Step 1: Write the failing component tests** (PS-CG-001…008/015, PS-FV-001…008, PS-3DS-004/007)

```tsx
await user.type(input, '5398');
expect(input).toHaveValue('');
expect(input).toHaveAccessibleDescription(/isn't a PaySandbox test card/);
await user.click(screen.getByRole('button', { name: /4242 4242 4242 4242/ }));
expect(input).toHaveValue('4242 4242 4242 4242'); expect(payButton).toBeEnabled();
// CardForm: empty email + '01 / 20' + CVC '12' → three field errors shown, focus on email, fetch not called
// CardForm: valid → fetch called once with a body that has no 'cvc' key and an attempt_id
// OtpDialog: Tab from last control wraps to the OTP input; Escape calls onCancel; Enter with 123456 calls onVerify('123456')
```

- [ ] **Step 2:** Run `pnpm --filter web test src/components/checkout`. Expected: FAIL.
- [ ] **Step 3:** Implement components and pages; reuse mockup copy and layout (`docs/mockup/index.html`), mobile-first.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: hosted checkout page`.

---

### Task 14: End-to-end checkout suite in CI

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/src/test/seed-e2e.ts`, `apps/web/e2e/checkout.spec.ts`, `api.spec.ts`, `projects.spec.ts`, `apps/web/src/app/e2e/store/page.tsx` + `e2e/store/thanks/page.tsx` (fake merchant pages, rendered only when `E2E_AUTH_BYPASS=1` and not on Vercel; 404 otherwise)
- Modify: `.github/workflows/ci.yml` (job `e2e`: `services: postgres:17`, `DATABASE_URL` to it, `pnpm --filter web db:migrate`, `next build && next start`, `playwright test --grep @smoke` on PRs, full suite nightly via `schedule`)

**Interfaces:**
- Consumes: everything above.
- Produces: `seedE2E(db: Db): Promise<{ merchantA: { id; sk; pk }; merchantB: { id; sk } }>` (fixed, known test keys; refuses to run unless `E2E_AUTH_BYPASS=1`).

- [ ] **Step 1: Write the E2E specs** (each test creates its session through the real API with merchant A's key)

```ts
test('4242 pays and returns to the store @smoke', …)            // PS-CO-001, PS-RD-001: /e2e/store → /c/cs_test_… → /e2e/store/thanks?pay=pay_…
test('9995 shows insufficient funds @smoke', …)                  // PS-CO-003
test('3220 with OTP 123456 succeeds @smoke', …)                  // PS-3DS-001
test('real-looking card is cleared and nothing is sent @smoke', async ({ page }) => {
  const bodies: string[] = []; page.on('request', r => bodies.push(r.postData() ?? ''));
  await page.getByLabel('Card information').pressSequentially('5398');
  await expect(page.getByLabel('Card information')).toHaveValue('');
  expect(bodies.join('')).not.toContain('5398');                // PS-CG-010
});
test('banner is on every checkout state @smoke', …)             // PS-AB-001: form, OTP dialog, success, declined, expired, already-paid, 404
test('checkout cannot be framed', …)                            // PS-RD-008: response headers on /c/<id>
test('paid session cannot be paid again', …)                    // PS-RD-003
test('double-click Pay creates one payment', …)                 // PS-CO-010
test('axe: no serious or critical violations @smoke', …)        // PS-A11Y-001 on form, errors, OTP dialog, success, declined
test('api: same Idempotency-Key replays @smoke', …)             // PS-IDEM-001 over HTTP
test('api: merchant B gets 404 for merchant A payment @smoke', …) // PS-AUTH-005
test('projects: secret shown once, then masked', …)             // PS-DEV-003 via e2e login
```

- [ ] **Step 2:** Run locally against a Postgres (`DATABASE_URL` = Neon dev branch or local Docker): `pnpm --filter web e2e`. Expected: all pass.
- [ ] **Step 3:** Update CI as above. Push. Expected: `e2e` job green.
- [ ] **Step 4:** Commit `test: e2e checkout suite and ci job`.

---

### Task 15: Deploy to Vercel + Neon

**Files:**
- Create: `apps/web/.env.example` (every variable name, no values: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_IDS`, `APP_URL`, `ABUSE_EMAIL`)
- Modify: `README.md` (local setup, env, scripts)

- [ ] **Step 1 [Abdul]:** Ask Abdul to approve, then: create Vercel project from `AbdulSubhan1/paysandbox` (root `apps/web`, project name `paysandbox` if free); add the Neon integration (free) so `DATABASE_URL` is set for Production and Preview (Neon branch per preview); create a production GitHub OAuth app with callback `https://<vercel-domain>/api/auth/callback/github`; set the env vars. **`E2E_AUTH_BYPASS` must not be set on Vercel.**
- [ ] **Step 2:** Set the build command to `pnpm db:migrate && pnpm build`. Deploy. Expected: deployment `READY`.
- [ ] **Step 3: Verify on production:** sign in as Abdul → create project → copy secret → `curl` create a session (with `Idempotency-Key`) → open the URL on a phone → pay with 4242 → redirected to `success_url`; pay another session with 3220 + `123456`; try `5398…` and confirm the field clears; `curl -I` the checkout URL shows the security headers; a non-allowlisted GitHub account lands on `/invite-only`.
- [ ] **Step 4:** Commit `docs: env example and setup readme`; tag `v0.1.0-plan1`.

---

## Self-review notes

- **Spec coverage (Plan 1 scope):** §3 constraints → Global Constraints; §4 architecture → Tasks 1, 5, 6, 8; §5 tables → Task 5 (refunds, disputes, webhook tables come with Plan 2's migration); §6.1–6.7 → Tasks 10–13; §7 card guard, headers, banner, names, keys → Tasks 3, 7, 12, 13; §7a caps → Task 8; §9 sessions + payments + errors + idempotency + OpenAPI → Tasks 8–12; §11 CI → Tasks 1, 14. Out of scope by design: §6.8–6.10, §8, §9 refunds/events, §10 (Plans 2–4).
- **Changed from DESIGN.md (flag for Abdul):** (1) DB driver is `pg` (Neon pooled URL) instead of the Neon serverless driver, so the app, CI Postgres and E2E share one driver; Vitest uses in-process PGlite. (2) API tests run on PGlite and E2E on a CI Postgres container, instead of a Neon branch per CI run; Neon preview branches still back Vercel previews. (3) Pay requests carry an `attempt_id` so a retried click can't double-charge (not in the design; from Review Focus 1).
