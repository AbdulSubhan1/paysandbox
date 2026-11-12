# PaySandbox component list (from the mockup, shadcn/ui based)

> Update 2026-11-12: shadcn/ui was replaced by our own components in `apps/web/src/components/ui` (see the KB's engineering highlights). The list below is the original plan.

Three separate places use UI, and each needs different things:

| Surface | Where it runs | Rule |
|---|---|---|
| **Hosted checkout** | `/c/*` on `paysandbox.vercel.app` | Few components, fast, little JS. Holds the card guard and the TEST MODE banner. |
| **Dashboard + Developers** | `/dashboard/*` on the same app | Full shadcn set: sidebar, tables, forms, charts. |
| **`@paysandbox/react`** (npm) | Inside merchants' own sites | **No shadcn, no Tailwind.** One small button with inline styles, so it works on any site. |

## 1. shadcn components to install

`v1` = needed for the first version. `later` = only when that feature is built.

| shadcn component | Used for | Surface | When |
|---|---|---|---|
| Button | Pay, Refund, Copy, Reveal, Send test event | all | v1 |
| Spinner | "Processing…", "Redirecting to PaySandbox…" | checkout, dashboard | v1 |
| Input, Label, Field | Email, name, card form, refund amount (Field shows the error text) | checkout, dashboard | v1 |
| Input Group | Card number with brand logo; API key with Copy button | checkout, developers | v1 |
| Input OTP | Bank 3-D Secure screen (6 boxes) | checkout | v1 |
| Dialog | Bank OTP screen | checkout | v1 |
| Alert | Decline message, "real card refused" message, "no live mode" note | checkout, dashboard | v1 |
| Card | Panels, KPI tiles, checkout box | all | v1 |
| Badge | Payment status, webhook delivery status, "Test" tag | dashboard | v1 |
| Sidebar (+ `sidebar-07` block) | Dashboard shell: Overview, Payments, Customers… | dashboard | v1 |
| Table + Data Table (TanStack) | Payments, webhook events, API log, customers | dashboard | v1 |
| Toggle Group | Status filter chips (All / Succeeded / Failed…) | dashboard | v1 |
| Tabs | Code snippet tabs (React / Server / REST / Webhook) | developers | v1 |
| Select | Refund reason, test event type | dashboard | v1 |
| Sonner | "Webhook payment.succeeded sent", "Copied" toasts | dashboard | v1 |
| Breadcrumb | Payments → pay_123 | dashboard | v1 |
| Separator, Skeleton, Empty | Dividers, loading rows, "No payments yet" | dashboard | v1 |
| Tooltip | Test-mode pill ("live mode does not exist") | dashboard | v1 |
| Switch | Live-mode toggle (always off, disabled), webhook endpoint on/off | dashboard | v1 |
| Alert Dialog | "Roll secret key?", "Accept dispute and lose?" | dashboard | v1 |
| Chart (Recharts) | Payments by status, volume over 7 days | dashboard | v1 (status), later (volume) |
| Dropdown Menu | Row actions: Refund, Copy ID, Open in webhooks | dashboard | later |
| Pagination | Long payment / event lists | dashboard | later |
| Sheet | Mobile sidebar; refund form as a side panel | dashboard | later |
| Collapsible | Expand a webhook attempt to see the response body | developers | later |
| Popover + Calendar (Date Picker) | Date range filter on payments | dashboard | later |
| Command | Search by payment ID / email (Ctrl+K) | dashboard | later |
| Avatar | Customer initials | dashboard | later |

Starting point: shadcn's `dashboard-01` block already combines Sidebar + Chart + Data Table, which covers most of the dashboard shell.

**Not needed:** Accordion, Carousel, Menubar, Navigation Menu, Resizable, Slider, Hover Card, Context Menu, Aspect Ratio, Drawer, Radio Group, Checkbox (until there is a settings page).

## 2. Our own components (shadcn has nothing for these)

| Component | Built from | What it does | When |
|---|---|---|---|
| **TestModeBanner** | plain div | Hazard-tape "TEST MODE · no real payments". Rendered by the server on every checkout page; no prop to hide it. | v1 |
| **CardNumberInput** | Input Group | The safety piece: formats `4242 4242…`, shows the brand, accepts **only** test card numbers, and clears the field after 4 digits that don't match. The number never reaches state, logs or the network. Needs unit tests. | v1 |
| **TestCardPicker** | Button list | Click a test card to fill the form | v1 |
| **OrderSummary** | Card | Merchant name, line items, total | v1 |
| **PaymentResult** | Card + Alert | Success / declined screen with code (`card_declined · insufficient_funds`) | v1 |
| **StatusBadge** | Badge | Maps `succeeded / failed / refunded / partially_refunded / disputed / requires_action` to colour + label | v1 |
| **Money** | span | Formats paisa → `PKR 5,100.00` (amounts stored in minor units) | v1 |
| **IdText** | span + Button | Mono ID (`pay_…`, `evt_…`) with click-to-copy | v1 |
| **StatusTimeline** | ul | Vertical timeline on payment detail (created → OTP → succeeded → refund → dispute) | v1 |
| **StatCard** | Card | KPI tile: label, amount, count | v1 |
| **SecretField** | Input Group | Secret API key: shown in full **once** after create / roll with Copy, then only `sk_test_…7Hq2`. Webhook signing secret: masked with Reveal + Copy | v1 |
| **CodeBlock** | Tabs + pre | Code tabs with Copy; highlighting with Shiki on the server (no runtime cost) | v1 |
| **JsonView** | pre | Webhook payload and request headers | v1 |
| **DeliveryAttempts** | list + Badge | Attempt 1 → 500, attempt 2 → 200, next retry time | v1 |
| **RefundForm** | Field + Input + Select | Amount ≤ amount left (zod check), full or partial | v1 |
| **DisputePanel** | Card + Alert Dialog | Reason, amount on hold, respond-by date, win / lose | later |
| **PaySandboxButton** | plain React, inline styles | The npm component merchants install; calls their server, then redirects | v1 (npm) |

## 3. Design tokens to set once in `globals.css`

shadcn reads CSS variables, so the mockup's look carries over by setting these:
- `--background` sand `#f4efe4`, `--card` paper `#fffdf8`, `--foreground` ink `#1d1b17`, `--border` `#e3dbc9`
- `--primary` green `#0d7a5c`, `--destructive` `#b4361c`
- extra status colours: `--success`, `--warning`, `--info`, `--violet` (for StatusBadge and charts)
- `--hazard` `#f2b705` (TestModeBanner only)
- fonts: IBM Plex Sans + IBM Plex Mono (via `next/font`)
