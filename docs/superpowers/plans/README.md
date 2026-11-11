# PaySandbox v1: plan roadmap

Spec: `../DESIGN.md` (approved 2026-11-11). v1 is split into four plans. Each plan ends with software that works and is deployed, and each starts only after the previous one is merged.

| Plan | Delivers | Design sections | Status |
|---|---|---|---|
| **1. Core payment loop** (`2026-11-11-plan-1-core-payment-loop.md`) | Repo + CI, invite-only GitHub login, projects + API keys, checkout sessions API with idempotency and usage caps, hosted checkout with card guard, every test-card outcome and OTP, redirect back, events recorded (not delivered yet), deployed on Vercel + Neon | §3, §4, §5 (core tables), §6.1–6.7, §7, §7a, §9 (sessions, payments) | done: live, `v0.1.0-plan1` |
| **2. Webhooks, timers, refunds, disputes** (`2026-11-11-plan-2-webhooks-refunds-disputes.md`) | QStash wiring, Standard Webhooks signing + delivery + retries + endpoint auto-disable, SSRF guard, session-expiry and dispute-deadline timers, card 0259 dispute, refunds API + engine, dispute engine, `GET /events/{id}` | §6.7–6.10, §8, §9 (refunds, events) | done: live, `v0.2.0-plan2` |
| **3. Merchant dashboard** (`2026-11-11-plan-3-dashboard.md`) | Overview, payments list + detail timeline, refund + dispute UI, customers, test cards, developers page (keys, snippets, usage), webhook endpoint + event log UI, API request log, project switcher | §10 (dashboard), COMPONENTS.md | done: live, `v0.3.0-plan3` |
| **4. Demo, docs, release** (`2026-11-11-plan-4-demo-docs-release.md`; no npm package) | Guest sandboxes + demo store + built-in webhook receiver, `/docs` with CI-run snippets, `@paysandbox/react` on npm, security headers audit, ZAP, gitleaks, Lighthouse, k6, full TEST-PLAN pass, admin allowlist page | §7 (abuse), §10 (demo, docs), §11 | written |

Plans 2–4 are written when the previous plan is merged, so they can use the real code instead of guesses.
