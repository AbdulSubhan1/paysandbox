# PaySandbox Plan 3: Merchant Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every project gets a real dashboard: overview totals, payments (list, filters, detail with timeline, refund, simulated dispute with win/lose), customers, disputes, test cards, developers (keys, code snippets, today's usage), webhooks (endpoint, event log, event detail with every attempt, Resend now) and the API request log. API requests also get faster by cutting database round trips.

**Architecture:** A new route segment `app/dashboard/[merchantId]/` whose layout checks ownership once (`getOwnedMerchant`, else `notFound()`) and renders the sidebar and project switcher. Each page is a server component that reads through small merchant-scoped query modules in `lib/dashboard/`; every query takes `merchantId` and filters by it. Mutations are server actions in each page folder that re-check ownership and call the existing engines (`createRefund`, `openDispute`, `closeDispute`, the endpoint functions). The Projects page becomes the project list plus create; keys and the webhook card move into the project's Developers and Webhooks pages.

**Tech Stack:** As Plans 1–2. No new dependencies: the "Payments by status" bar is plain divs, not a chart library.

**Spec:** `docs/superpowers/specs/2026-11-11-paysandbox-v1-design.md` §10 (and §6.9–6.10, §8 for the refund, dispute and webhook UI); components in `…-components.md`; test cases `PS-DB-*`, `PS-DEV-003/004`, `PS-RF-009/010`, `PS-DP-001/003/004/006`, `PS-WH-007/009/015` in `…-test-plan.md`; look and layout from `docs/mockup/index.html`.

## Global Constraints

Plan 1 and Plan 2 Global Constraints still apply. In addition:

- Every dashboard read and write is scoped to the project in the URL, and that project must be owned by the signed-in user. Anything else is `notFound()`, never another merchant's data.
- Times in the UI are Pakistan time (`Asia/Karachi`), for example `11 Nov 2026, 6:51 pm`. The API keeps unix seconds.
- Money in the UI is always `formatPkr(paisa)`. Typed amounts are parsed to integer paisa with `parsePkrInput`, never with float math.
- Net volume = succeeded volume − refunded − lost disputes, to the paisa (PS-RF-009). Succeeded volume = the sum of `amount` over payments in `succeeded`, `partially_refunded`, `refunded`, `disputed` and `dispute_lost`.
- Sidebar order and labels exactly: Overview · Payments · Customers · Disputes · Test cards, then a **Developers** group: API keys & code · Webhooks · API request log.
- Next.js 16 `cacheComponents`: request-time data (session, params, database) is read only inside async components under `<Suspense>`, as on the existing Projects page.
- Mobile-first Tailwind: base classes for mobile, `md:` / `lg:` overrides, never `max-*`. On mobile the sidebar becomes a horizontally scrolling nav above the content.
- Request bodies are never stored or shown (PS-DEV-004). Webhook attempt rows show the headers we sent (with the signature, never the secret) and the receiver's response snippet as plain text.
- **Testing rule (Abdul, 2026-11-11):** unit and component tests per task. Playwright E2E only in Task 13, once, for the specs this plan touches. Don't watch CI after pushing.

**Plan calls:**
1. URL shape is `/dashboard/[merchantId]/…`, and the Projects page links into it. `/dashboard` keeps redirecting to `/dashboard/projects`.
2. The "Simulate dispute" reason is `product_not_received` (the mockup's story: "the customer says the product never arrived"). Card 0259 keeps `fraudulent`.
3. "Resend now" re-arms the existing delivery (the same event ID, the same delivery row, one more attempt now) rather than creating a second delivery, because `(event_id, endpoint_id)` is unique.
4. Snippets on the Developers page are static text filled with the project's publishable key and a `sk_test_…` placeholder. Compiling them in CI (PS-DEV-001) stays in Plan 4 with the docs page.

## Review Focus

1. **Another merchant's IDs in the URL:** `/dashboard/<my project>/payments/<their pay_id>`, `/dashboard/<their project>/…` and `/dashboard/<my project>/webhooks/<their evt_id>` all return the 404 page and no data. Tests in Task 2 and Task 5.
2. **Typed refund amounts:** `1,000.50` gives 100050 paisa; `1000.505`, `0`, `-5`, `abc` and an empty box give a clear message; `5100` with 5,100.00 left refunds everything. Tests in Task 1 and Task 6.
3. **Payments list paging when rows share a timestamp:** walking every page with the status and customer filters on shows each payment exactly once. Test in Task 4.
4. **A receiver that answers with HTML or a script:** the event detail page shows the snippet as text, not markup, and nowhere shows the signing secret. Test in Task 9.
5. **Clicking Refund or Simulate dispute twice quickly:** one refund or one dispute. The buttons disable while sending, and the engines already refuse the second dispute. Test in Task 6.

---

## File structure

```
apps/web/src/
  lib/format.ts                                   # formatPkt, parsePkrInput (Task 1)
  lib/dashboard/overview.ts  payments.ts  payment-detail.ts  customers.ts  disputes.ts
                 events.ts  request-log.ts  usage.ts
  lib/payments/activity.ts                        # addActivity moved out of pay.ts (Task 12)
  lib/webhooks/resend.ts                          # Task 9
  components/dashboard/  Sidebar.tsx  ProjectSwitcher.tsx  StatusBadge.tsx  StatCard.tsx  IdText.tsx
                         StatusTimeline.tsx  RefundForm.tsx  DisputePanel.tsx  DeliveryAttempts.tsx
                         CodeBlock.tsx  EmptyState.tsx  Pager.tsx
  app/dashboard/projects/                         # list + create only (Task 2)
  app/dashboard/[merchantId]/layout.tsx  page.tsx (overview)
      payments/page.tsx  payments/[paymentId]/page.tsx  payments/[paymentId]/actions.ts
      customers/page.tsx  disputes/page.tsx  test-cards/page.tsx
      developers/page.tsx  developers/actions.ts
      webhooks/page.tsx  webhooks/[eventId]/page.tsx  webhooks/actions.ts
      logs/page.tsx
apps/web/e2e/dashboard.spec.ts                    # Task 13
```

---

### Task 1: Time and money formatting for the UI

**Files:**
- Create: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `formatPkt(d: Date): string` (Intl, `Asia/Karachi`, `en-GB` day-month order, 12-hour time, for example `11 Nov 2026, 6:51 pm`)
  - `type PkrParse = { ok: true; paisa: number } | { ok: false; message: string }`
  - `parsePkrInput(raw: string): PkrParse` (trims; allows commas as thousands separators and up to 2 decimals; must be > 0)

- [ ] **Step 1: Write the failing tests** (PS-DB-007, PS-DB-008, Review Focus 2)

```ts
expect(formatPkt(new Date('2026-11-11T13:51:00Z'))).toBe('11 Nov 2026, 6:51 pm');
expect(formatPkt(new Date('2026-11-11T19:30:00Z'))).toBe('12 Nov 2026, 12:30 am'); // Karachi is UTC+5
expect(parsePkrInput('1,000.50')).toEqual({ ok: true, paisa: 100050 });
expect(parsePkrInput(' 5100 ')).toEqual({ ok: true, paisa: 510000 });
expect(parsePkrInput('0.1')).toEqual({ ok: true, paisa: 10 });
expect(parsePkrInput('0.29')).toEqual({ ok: true, paisa: 29 }); // no float drift
for (const bad of ['1000.505', '0', '-5', 'abc', '', '1,00,0', '1e3']) expect(parsePkrInput(bad).ok).toBe(false);
```

- [ ] **Step 2:** Run `pnpm --filter web exec vitest run src/lib/format.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Parse with a regex `^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$`, then build paisa from the string parts (integer × 100 + padded decimals), never `parseFloat × 100`.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): Pakistan-time and PKR input formatting`.

---

### Task 2: Dashboard shell, ownership guard and project switcher

**Files:**
- Create: `apps/web/src/app/dashboard/[merchantId]/layout.tsx`, `apps/web/src/app/dashboard/[merchantId]/page.tsx` (placeholder heading "Overview", replaced in Task 3), `apps/web/src/components/dashboard/Sidebar.tsx`, `apps/web/src/components/dashboard/ProjectSwitcher.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx` (the header stays; the `[merchantId]` layout adds the sidebar), `apps/web/src/app/dashboard/projects/ProjectsView.tsx` (add "Open dashboard" link per project)
- Test: `apps/web/src/components/dashboard/Sidebar.dom.test.tsx`, `apps/web/src/lib/merchants/merchants.test.ts` (extend)

**Interfaces:**
- Consumes: `getOwnedMerchant(db, userId, merchantId)`, `listMerchants(db, userId)`, `requireUser()`.
- Produces:
  - `requireProject(merchantId: string): Promise<{ user; merchant: Merchant; projects: Merchant[] }>` in `lib/merchants/merchants.ts`: `requireUser()` plus ownership; calls `notFound()` if not owned. Every page and action in this plan starts with it.
  - `<Sidebar merchantId current />`: the nav items from the Global Constraints, `aria-current="page"` on the active one; `current` is a key `'overview' | 'payments' | 'customers' | 'disputes' | 'test-cards' | 'developers' | 'webhooks' | 'logs'`.
  - `<ProjectSwitcher current projects />`: a native `<select>` labelled "Project" that navigates to the same section of the chosen project.
  - The header's "Test mode · live mode not available" pill gets the title "Live mode does not exist. PaySandbox never moves real money." (PS-DB-009).

- [ ] **Step 1: Write the failing tests:**
  - Sidebar renders the 8 links in order with hrefs `/dashboard/mer_1`, `/dashboard/mer_1/payments` … `/dashboard/mer_1/logs`; `current="payments"` marks only Payments with `aria-current="page"`; the Developers group heading is present.
  - `requireProject` (with `requireUser` mocked to a user): returns the merchant for the owner, and calls `notFound` (mocked to throw) for another user's project and for a missing ID (Review Focus 1).
- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement. The layout is synchronous and puts the guarded part (`requireProject`, sidebar, switcher) in an async child under `<Suspense>`; `children` render beside it.
- [ ] **Step 4:** Run. Expected: PASS. Run `pnpm typecheck` (the new route types).
- [ ] **Step 5:** Commit: `feat(dashboard): per-project shell with sidebar, switcher and ownership guard`.

---

### Task 3: Overview

**Files:**
- Create: `apps/web/src/lib/dashboard/overview.ts`, `apps/web/src/components/dashboard/StatCard.tsx`, `apps/web/src/components/dashboard/StatusBadge.tsx`, `apps/web/src/components/dashboard/EmptyState.tsx`
- Modify: `apps/web/src/app/dashboard/[merchantId]/page.tsx`
- Test: `apps/web/src/lib/dashboard/overview.test.ts`, `apps/web/src/components/dashboard/StatusBadge.dom.test.tsx`

**Interfaces:**
- Produces:
  - `type Overview = { netVolume: number; succeeded: { amount: number; count: number }; refunded: { amount: number; count: number }; failed: { amount: number; count: number }; needsOtp: { amount: number; count: number }; disputed: { amount: number; count: number }; statusCounts: Partial<Record<PaymentStatus, number>>; recentPayments: DashboardPaymentRow[]; recentEvents: EventListRow[] }`
  - `getOverview(db: Db, merchantId: string): Promise<Overview>`. `disputed` counts open and lost disputes, with the amount on hold or lost; `refunded.count` counts payments with `amountRefunded > 0`.
  - `<StatusBadge status />`: label and colour per status (Succeeded, Partially refunded, Refunded, Failed, Needs OTP, Disputed, Dispute lost), from the mockup's `STAT_COLOR`.
  - `<StatCard label value caption href />`, `<EmptyState title body action? />`
  - `DashboardPaymentRow` and `EventListRow` come from Tasks 4 and 9; to keep this task first, define both types here in `overview.ts` and re-export them from those modules.
- Page: the 6 tiles in the mockup's order (Net volume, Succeeded, Refunded, Failed, Needs OTP, Disputed); the "Payments by status" bar (div widths ∝ counts, with a legend); Recent payments (5) and Recent webhooks (5). With no payments: `EmptyState` "No payments yet" with a link to API keys & code (PS-DB-005).

- [ ] **Step 1: Write the failing tests** (PS-DB-001, PS-RF-009). With factories, for merchant A make:
  - 510000 succeeded
  - 200000 partially refunded by 50000
  - 100000 refunded in full
  - 300000 failed
  - 150000 requires_action
  - 400000 dispute lost
  - 250000 disputed (open)

  Merchant B gets one 999900 succeeded. Then:

```ts
const o = await getOverview(db, merchantA);
expect(o.netVolume).toBe(510000 + 200000 + 100000 + 400000 + 250000 - 50000 - 100000 - 400000); // 910000
expect(o.succeeded).toEqual({ amount: 510000, count: 1 });
expect(o.refunded).toEqual({ amount: 150000, count: 2 });
expect(o.failed).toEqual({ amount: 300000, count: 1 });
expect(o.needsOtp).toEqual({ amount: 150000, count: 1 });
expect(o.disputed).toEqual({ amount: 650000, count: 2 });
expect(o.recentPayments.every((p) => p.merchantId === merchantA)).toBe(true);
expect((await getOverview(db, emptyMerchant)).statusCounts).toEqual({});
```

  StatusBadge: `requires_action` reads "Needs OTP", `dispute_lost` reads "Dispute lost".
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `getOverview` with grouped SQL aggregates (one query for status sums and counts, one for refunds, one for disputes, plus the two recent lists), not by loading every payment.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): overview totals, status bar and recent activity`.

---

### Task 4: Payments list with status chips, customer filter and paging

**Files:**
- Create: `apps/web/src/lib/dashboard/payments.ts`, `apps/web/src/components/dashboard/Pager.tsx`, `apps/web/src/components/dashboard/IdText.tsx`
- Create: `apps/web/src/app/dashboard/[merchantId]/payments/page.tsx`
- Test: `apps/web/src/lib/dashboard/payments.test.ts`

**Interfaces:**
- Produces:
  - `type DashboardPaymentRow = { id; merchantId; amount; status; cardBrand; cardLast4; createdAt: Date; customerName; customerEmail }`
  - `PAYMENTS_PAGE_SIZE = 25`
  - `listDashboardPayments(db, merchantId, opts: { status?: PaymentStatus; customerEmail?: string; before?: string }): Promise<{ rows: DashboardPaymentRow[]; next: string | null }>`. Newest first by (`createdAt`, `id`). `before` is an opaque cursor `<createdAt ms>.<id>`; a bad cursor gives page 1.
  - `paymentStatusCounts(db, merchantId, opts: { customerEmail?: string }): Promise<{ all: number } & Partial<Record<PaymentStatus, number>>>`
  - `<IdText value />`: monospace ID with a copy button (Sonner "Copied"). `<Pager next href />`: an "Older" link.
- Page: `searchParams` `status`, `customer`, `before`. The chips are All, Succeeded, Failed, Partially refunded, Refunded, Needs OTP and Disputed, each with its count (PS-DB-002). A table (Amount, Status, Customer, Card, Date, Payment ID) whose rows link to the detail. "Showing {name} only · clear" when filtered by customer.

- [ ] **Step 1: Write the failing tests:**
  - **Review Focus 3:** 60 payments for merchant A, every three sharing one `createdAt`, mixed statuses and two customers. Walking all pages with `status: 'succeeded', customerEmail: x` returns each matching ID exactly once, in order, and the last page has `next: null`.
  - **PS-DB-002:** the status counts equal the row totals for each chip.
  - Merchant B's payments never appear.
  - A malformed `before` returns the first page.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with a keyset `WHERE (created_at, id) < ($1, $2)`, limit page size + 1 to know `next`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): payments list with status chips, customer filter and paging`.

---

### Task 5: Payment detail with timeline

**Files:**
- Create: `apps/web/src/lib/dashboard/payment-detail.ts`, `apps/web/src/components/dashboard/StatusTimeline.tsx`
- Create: `apps/web/src/app/dashboard/[merchantId]/payments/[paymentId]/page.tsx`
- Test: `apps/web/src/lib/dashboard/payment-detail.test.ts`

**Interfaces:**
- Produces:
  - `type PaymentDetail = { payment: PaymentRow; customer: CustomerRow; timeline: { kind: string; message: string; at: Date; detail: unknown }[]; refunds: RefundRow[]; dispute: DisputeRow | null; events: EventListRow[]; amountLeft: number }`
  - `getPaymentDetail(db, merchantId, paymentId): Promise<PaymentDetail | null>`. The timeline is the session's "Checkout session created" row, then the payment's activity rows, ordered by `createdAt` then `seq` (PS-DB-003). `events` are the events whose payload is this payment, or a refund or dispute of it.
  - `<StatusTimeline items />`: a vertical list with a coloured dot per kind (succeeded green, failed red, refunded grey, dispute violet, otp amber).
- Page: hero amount, `StatusBadge` and `IdText`; a Details panel (customer, card brand •••• last4, test card, created in PKT, checkout session ID); the Timeline; Refunds; "Webhooks for this payment" linking to the event detail. The action area is filled in Task 6. Unknown or foreign ID → `notFound()`.

- [ ] **Step 1: Write the failing tests:**
  - A payment that was created, then OTP, succeeded, refunded 100000 and disputed gives a timeline in time order. Two rows with the same `createdAt` keep insert order (`seq`). `amountLeft` = 410000.
  - `events` includes `payment.succeeded`, `refund.created` and `dispute.created` for it, and not another payment's events.
  - **Review Focus 1:** `getPaymentDetail(db, merchantA, paymentOfB)` → `null`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Event matching: `payload->>'id' = $payment OR payload->>'payment' = $payment`, scoped by merchant.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): payment detail with timeline, refunds and its webhooks`.

---

### Task 6: Refund and dispute actions on the payment page

**Files:**
- Create: `apps/web/src/components/dashboard/RefundForm.tsx`, `apps/web/src/components/dashboard/DisputePanel.tsx`, `apps/web/src/app/dashboard/[merchantId]/payments/[paymentId]/actions.ts`
- Modify: the payment detail page (buttons and panels)
- Test: `apps/web/src/components/dashboard/RefundForm.dom.test.tsx`, `apps/web/src/components/dashboard/DisputePanel.dom.test.tsx`

**Interfaces:**
- Consumes: `parsePkrInput` (Task 1), `createRefund`, `REFUND_REASONS`, `openDispute`, `closeDispute`, `flushJobsAfterResponse`, `requireProject` (Task 2).
- Produces:
  - Server actions (each `requireProject(merchantId)` first, `revalidatePath` of the payment page, `flushJobsAfterResponse({ merchantId })`, and returning `{ ok: true } | { ok: false; error: string }`; an `ApiError` or `DisputeError` becomes its message):
    - `refundPaymentAction(merchantId, paymentId, amountText: string, reason: string)`
    - `simulateDisputeAction(merchantId, paymentId)` with reason `product_not_received`
    - `closeDisputeAction(merchantId, disputeId, outcome: 'won' | 'lost')`
  - `<RefundForm merchantId paymentId amountLeft />`:
    - an amount box prefilled with the amount left (formatted without `PKR`), labelled "Amount (max PKR …)"
    - a "Reason" select whose default option is "Choose a reason" with an empty value
    - a Refund button, disabled while sending
    - a Sonner toast on success ("Refunded PKR …") or failure
  - `<DisputePanel merchantId dispute />`: shows amount on hold, reason and respond-by (PKT); "Submit evidence and win"; "Accept and lose" behind an AlertDialog.
  - "Simulate dispute" is shown only for `succeeded` / `partially_refunded` payments with no dispute; Refund only when `amountLeft > 0` and the payment isn't disputed.

- [ ] **Step 1: Write the failing tests** (PS-RF-010, PS-DP-006, Review Focus 2 and 5), with actions mocked:
  - Default amount = amount left, and submitting with no reason shows "Choose a reason" without calling the action.
  - `1000.505` shows the `parsePkrInput` message without calling the action.
  - A slow action plus two clicks on Refund → the action is called once and the button is disabled while pending.
  - "Accept and lose", then Cancel → `closeDisputeAction` is not called; confirm → called with `'lost'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the components and actions; amounts go to the action as text and are parsed on the server too.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): refund, simulate dispute and win/lose from the payment page`.

---

### Task 7: Customers, Disputes and Test cards pages

**Files:**
- Create: `apps/web/src/lib/dashboard/customers.ts`, `apps/web/src/lib/dashboard/disputes.ts`
- Create: `app/dashboard/[merchantId]/customers/page.tsx`, `…/disputes/page.tsx`, `…/test-cards/page.tsx`
- Test: `apps/web/src/lib/dashboard/customers.test.ts`, `apps/web/src/lib/dashboard/disputes.test.ts`

**Interfaces:**
- Produces:
  - `listCustomers(db, merchantId): Promise<{ id; name; email; payments: number; netPaid: number; lastPaymentAt: Date | null }[]>`. `netPaid` = the sum of amounts in the succeeded-volume statuses − refunded − lost disputes, per customer (PS-DB-004). Ordered by `lastPaymentAt` descending.
  - `listDisputes(db, merchantId): Promise<(DisputeRow & { customerName: string })[]>`: open ones first (by `respondBy`), then closed ones newest first.
- Pages:
  - **Customers:** table (Name, Email, Payments, Net paid, Last payment). The email links to the Payments list filtered by that customer.
  - **Disputes:** table (Amount, Status badge, Reason, Respond by PKT, Payment link). Empty state "No disputes. Pay with card 4000 0000 0000 0259 or use Simulate dispute on a payment."
  - **Test cards:** `TEST_CARDS` grouped by outcome (number with copy, brand, title, description), noting that 0259 is hidden from the checkout picker.

- [ ] **Step 1: Write the failing tests:** two payments from the same email collapse into one customer row with `payments: 2`, and `netPaid` subtracts a partial refund; another merchant's customer with the same email is a separate row in their own list. Disputes come in the open-then-closed order.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): customers, disputes and test cards pages`.

---

### Task 8: API keys & code (Developers page)

**Files:**
- Create: `apps/web/src/lib/dashboard/usage.ts`, `apps/web/src/components/dashboard/CodeBlock.tsx`, `app/dashboard/[merchantId]/developers/page.tsx`, `app/dashboard/[merchantId]/developers/actions.ts`
- Modify: `app/dashboard/projects/ProjectsView.tsx`, `app/dashboard/projects/actions.ts` (the key roll moves here; the Projects page keeps list + create + the one-time secret dialog after create)
- Test: `apps/web/src/lib/dashboard/usage.test.ts`, `apps/web/src/components/dashboard/CodeBlock.dom.test.tsx`

**Interfaces:**
- Produces:
  - `getUsageToday(db, merchantId, now: Date): Promise<Record<UsageCounter, { used: number; cap: number }>>`: a read only; it never inserts (reads never write).
  - `rollSecretKeyAction(merchantId)`, moved from `projects/actions.ts` into `developers/actions.ts`, using `requireProject`.
  - `<CodeBlock tabs={{ label: string; code: string }[]} />`: tabs (shadcn-free buttons with `role="tab"`) and a Copy button.
- Page:
  - **Keys:** the publishable key with Copy; the secret key as `sk_test_…last4` with "Roll secret key" (the same AlertDialog and one-time dialog as before).
  - **Snippets:** "Next.js route handler" (creates a session with `fetch` and redirects), `curl` and "Verify a webhook" (`standardwebhooks`), each using `APP_URL`.
  - **Today's usage:** a bar per counter "used / cap", resetting at midnight Pakistan time.

- [ ] **Step 1: Write the failing tests:** `getUsageToday` for a merchant with no usage row returns zeros with the caps (200 webhook attempts) and inserts nothing; with a row, it returns its counts. CodeBlock switches tabs and Copy writes the active tab's code to the clipboard.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; remove the keys and webhook card from the Projects page (the webhook card moves in Task 9).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): API keys, code snippets and today's usage`.

---

### Task 9: Webhooks: endpoint, event log, event detail and Resend now

**Files:**
- Create: `apps/web/src/lib/dashboard/events.ts`, `apps/web/src/lib/webhooks/resend.ts`, `apps/web/src/components/dashboard/DeliveryAttempts.tsx`
- Create: `app/dashboard/[merchantId]/webhooks/page.tsx`, `…/webhooks/[eventId]/page.tsx`, `…/webhooks/actions.ts`
- Move: `app/dashboard/projects/WebhookEndpointCard.tsx` and `webhook-actions.ts` → `app/dashboard/[merchantId]/webhooks/` (actions switch to `requireProject`)
- Test: `apps/web/src/lib/dashboard/events.test.ts`, `apps/web/src/lib/webhooks/resend.test.ts`, `apps/web/src/components/dashboard/DeliveryAttempts.dom.test.tsx`, `WebhookEndpointCard.dom.test.tsx` (moved and extended)

**Interfaces:**
- Produces:
  - `type EventListRow = { id; type; createdAt: Date; delivery: { state: 'pending' | 'delivered' | 'failed'; attemptCount: number; nextAttemptAt: Date | null } | null }`
  - `listEvents(db, merchantId, opts: { before?: string }): Promise<{ rows: EventListRow[]; next: string | null }>`: 25 per page, newest first, using the same cursor scheme as Task 4.
  - `getEventDetail(db, merchantId, eventId): Promise<{ event: EventRow; body: string; delivery: DeliveryRow | null; attempts: AttemptRow[] } | null>`. `body` is the exact JSON we send (`JSON.stringify(toEventObject(event))`).
  - `resendEvent(db, merchantId, eventId, now): Promise<{ ok: true } | { ok: false; reason: 'no_delivery' | 'endpoint_disabled' | 'in_progress' }>`. It sets the delivery back to `pending` with `nextAttemptAt = now` and enqueues a `deliver_webhook` job now. The attempt count continues, so a failure leaves it `failed` again without new retries. It refuses while a delivery is `pending` with a future retry (`in_progress`).
  - `resendEventAction(merchantId, eventId)`, which calls the flush.
  - `<DeliveryAttempts attempts />`: per attempt the number, PKT time, status code or error, duration, the headers we sent and the response snippet in `<pre>` as text.
- Pages:
  - **Webhooks:** the endpoint card (moved). Its state now follows its props: key it by `endpoint.url + enabled`, fixing the Plan 2 minor where an auto-disabled endpoint showed no banner. Below it, the event log table (Type, Created PKT, Delivery badge Delivered / Retrying / Failed / Not sent).
  - **Event detail:** event ID and type; "Request we sent" (headers and pretty JSON body); `DeliveryAttempts`; a "Resend now" button with toasts.

- [ ] **Step 1: Write the failing tests:**
  - **PS-WH-009:** after a delivered event, `resendEvent` puts the delivery back to `pending` with one due job. Running it (with the real HTTP test server from Plan 2's delivery tests) makes attempt N+1 with the same `webhook-id`. `resendEvent` on a delivery with a future retry returns `in_progress`.
  - **Review Focus 1:** `getEventDetail(db, merchantA, eventOfB)` → `null`.
  - **Review Focus 4:** `DeliveryAttempts` with `responseSnippet: '<script>alert(1)</script><b>x</b>'` shows that exact text, and `container.querySelector('script, b')` is null. The headers shown contain `webhook-signature` and no `whsec_`.
  - The endpoint card re-renders the disabled banner when its `endpoint` prop changes to `enabled: false`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): webhooks page, event log, delivery attempts and Resend now`.

---

### Task 10: API request log page

**Files:**
- Create: `apps/web/src/lib/dashboard/request-log.ts`, `app/dashboard/[merchantId]/logs/page.tsx`
- Test: `apps/web/src/lib/dashboard/request-log.test.ts`

**Interfaces:**
- Produces: `listApiRequests(db, merchantId, opts: { before?: string; failedOnly?: boolean }): Promise<{ rows: { id; method; path; status; idempotencyKey; errorCode; durationMs; createdAt: Date }[]; next: string | null }>`, 50 per page.
- Page: table (Time PKT, Method, Path, Status with a colour by class, Idempotency key, Error code, Duration); "Failed only" toggle via `?failed=1`; paging; a footnote "Request and response bodies are never stored." (PS-DEV-004).

- [ ] **Step 1: Write the failing tests:** rows are merchant-scoped, newest first; `failedOnly` returns status ≥ 400 only; paging is the same as Task 4's.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): API request log page`.

---

### Task 11: Faster API requests (fewer database round trips)

**Files:**
- Modify: `apps/web/src/lib/api/handler.ts`, `apps/web/src/lib/api/usage.ts`, `apps/web/src/lib/keys/keys.ts`
- Test: `apps/web/src/lib/api/handler.test.ts` (extend), `apps/web/src/lib/api/usage.test.ts` (extend)

**Interfaces:**
- Produces:
  - `authenticateAndCount(db, authorization: string | null, now: Date): Promise<{ merchantId: string; usage: UsageResult }>`: one SQL statement. A CTE finds the key's merchant (hash match, not expired) and upserts `usage_daily.api_requests` in the same statement, returning both. It throws the same `ApiError`s as `authenticateRequest` (the "no key", `pk_test_` and live-key cases are decided before any query).
  - `withApi` uses it, then writes the request log in `after()` (via a `logAfterResponse` helper mocked in unit tests like the flush), and adds a `Server-Timing: db;dur=<ms>` header.
- Expected effect: from four sequential round trips before the handler runs (auth, usage, idempotency, and later the log on the response path) down to one plus idempotency.

- [ ] **Step 1: Write the failing tests:**
  - A valid key counts one request and returns the merchant.
  - An expired rolled key → 401 with nothing counted.
  - A wrong key → 401 with nothing counted.
  - The 1,001st request → 429 and still not logged (Plan 1 rule).
  - Responses carry `Server-Timing`.
  - The existing Plan 1 handler and idempotency tests pass unchanged.
- [ ] **Step 2:** Run. Expected: FAIL (`authenticateAndCount` missing).
- [ ] **Step 3:** Implement. Keep `authenticateRequest` only if something else uses it; otherwise delete it.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `perf(api): one round trip for auth + usage, request log after the response`.

---

### Task 12: Plan 2 leftovers

**Files:**
- Create: `apps/web/src/lib/payments/activity.ts` (move `addActivity` here; update imports in `pay.ts`, `otp.ts`, `expire.ts`, `refunds.ts`, `disputes.ts`)
- Modify: `apps/web/src/lib/webhooks/test-events.ts`, `apps/web/src/app/api/internal/cron/route.ts`, `apps/web/src/lib/jobs/scheduler.ts`
- Test: extend `test-events.test.ts`, `internal.api.test.ts`, `scheduler.test.ts`

**Interfaces:**
- Produces:
  - `addActivity` from `lib/payments/activity.ts`, the same signature. This breaks the `pay.ts` ↔ `disputes.ts` import cycle.
  - `sendTestEvent` runs the cap check and `recordEvent` in one `db.transaction`.
  - The cron route compares the bearer with `timingSafeEqual` on equal-length buffers.
  - `verifyQstashSignature(signature, body)` passes `url: \`${appUrl()}/api/internal/jobs\`` to `Receiver.verify`.

- [ ] **Step 1: Write the failing tests:**
  - **Test event:** with `recordEvent` mocked (`vi.spyOn` on its module) to throw, `sendTestEvent` rejects and today's `test_events` count is still 0, because the cap check rolled back with the transaction.
  - **Cron:** a bearer of the right length but wrong value gets 401.
  - **QStash:** `verify` is called with the jobs URL.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `fix: Plan 2 review leftovers (test-event transaction, constant-time cron check, QStash URL binding, activity module)`.

---

### Task 13: End-to-end, once

**Files:**
- Create: `apps/web/e2e/dashboard.spec.ts`
- Modify: `apps/web/e2e/projects.spec.ts` (keys and the webhook card moved off the Projects page)

- [ ] **Step 1: Write the tests** (new merchant per test via `newMerchant()` + E2E email login):
  - `@smoke` PS-DB-001: after a 4242 and a 9995 payment via `payViaApi`, the Overview shows Net volume `PKR 5,100.00`, and the Failed tile shows `PKR 5,100.00 · 1 payment`.
  - PS-RF-001/010: on the payment detail, Refund `1,000` with reason "Requested by customer" → toast, status badge "Partially refunded", timeline row "Refunded PKR 1,000.00".
  - PS-DP-001/003: Simulate dispute → the panel shows respond-by +7 days → "Submit evidence and win" → the badge returns to "Partially refunded".
  - PS-WH-009: on Webhooks, open the event → Resend now → a second attempt with the same `webhook-id` at the local receiver.
  - PS-DB-005: a fresh project's Overview shows "No payments yet".
  - Review Focus 1: another project's payment URL → the 404 page.
  - axe on Overview, Payments and payment detail.
  - Update `projects.spec.ts`: the secret-roll and webhook tests move to the Developers and Webhooks pages.
- [ ] **Step 2:** Run only the touched specs, once: `pnpm --filter web exec playwright test e2e/dashboard.spec.ts e2e/projects.spec.ts`. Expected: PASS (mobile runs `@smoke` only).
- [ ] **Step 3:** Commit: `test(e2e): dashboard pages, refund, dispute, resend and empty state`.

---

### Task 14: Ship

- [ ] **Step 1:** Final whole-branch review (one fresh reviewer, most capable model); fix Critical and Important findings, each with a failing test first.
- [ ] **Step 2:** Open the PR `plan-3/dashboard` → `main`. Don't watch CI.
- [ ] **Step 3 [Abdul]:** Approve the merge (it deploys production).
- [ ] **Step 4:** Production check with Abdul's project: Overview tiles match the payments from the Plan 2 check; refund and dispute from the UI send webhooks to webhook.site; time the same two requests as the sin1 baseline (key lookup, checkout read) and report the change.
- [ ] **Step 5:** Tag `v0.3.0-plan3`; mark Plan 3 done in the roadmap.
