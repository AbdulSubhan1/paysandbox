# PaySandbox

A sandbox payment gateway: Stripe-style test mode offered as a product, for developers who want a realistic payment flow in demos, portfolios and MVPs. **No real money ever moves; only PaySandbox test cards work.**

- Hosted checkout on PaySandbox's own URL with a permanent TEST MODE banner
- Test cards for success, declines and 3-D Secure OTP; real-looking card numbers are refused in the browser and on the server
- REST API with secret keys, IETF-style `Idempotency-Key`, daily usage caps and an OpenAPI 3.1 spec (`openapi.yaml`)
- Invite-only GitHub login, up to 3 projects per account

Design, test plan and implementation plans: `docs/superpowers/`.

## Local setup

Requires Node 24 and pnpm (`corepack enable pnpm`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
pnpm --filter web db:local                      # local Postgres (PGlite) on 127.0.0.1:5433, keep it running
pnpm --filter web db:migrate
pnpm --filter web seed:local                    # prints a test secret key for a local "Chai Code Co." merchant
pnpm --filter web dev
```

Create a checkout session and open its `url`:

```bash
curl -X POST http://localhost:3000/api/v1/checkout_sessions \
  -H "Authorization: Bearer sk_test_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order_1042" \
  -d '{"amount":510000,"currency":"pkr","line_items":[{"name":"Hoodie","quantity":1,"amount":510000}],"success_url":"http://localhost:3000/","cancel_url":"http://localhost:3000/"}'
```

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit, component and API tests (Vitest; in-process Postgres via PGlite) |
| `pnpm e2e` | Playwright end-to-end (starts its own throwaway database and dev server) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

CI runs lint, typecheck and unit tests on every push, the `@smoke` E2E set on pull requests, and the full E2E suite nightly.
