# Pages

Every screen of PaySandbox, one file each. All dashboard pages belong to one project; the header shows the project (a switcher when there are several, keeping the same section open), a "Test mode" pill and an account menu (initials: who is signed in, your projects, sign out).

| Page | Who | Address |
|---|---|---|
| [Home, sign-in and invite-only](sign-in.md) | Everyone | `/`, `/invite-only` |
| [Projects](projects.md) | Merchant | `/dashboard/projects` |
| [Overview](overview.md) | Merchant | `/dashboard/<project>` |
| [Payments](payments.md) | Merchant | `/dashboard/<project>/payments` |
| [Payment detail](payment-detail.md) | Merchant | `/dashboard/<project>/payments/<payment>` |
| [Customers](customers.md) | Merchant | `/dashboard/<project>/customers` |
| [Disputes](disputes.md) | Merchant | `/dashboard/<project>/disputes` |
| [Test cards](test-cards.md) | Merchant, customer | `/dashboard/<project>/test-cards` |
| [API keys & code](developers.md) | Developer | `/dashboard/<project>/developers` |
| [Webhooks](webhooks.md) | Developer | `/dashboard/<project>/webhooks` |
| [Webhook event](webhook-event.md) | Developer | `/dashboard/<project>/webhooks/<event>` |
| [API request log](api-request-log.md) | Developer | `/dashboard/<project>/logs` |
| [Hosted checkout](hosted-checkout.md) | Customer | `/c/<session>` |
| [Page not found](not-found.md) | Everyone | any unknown address |

New pages use [_TEMPLATE.md](_TEMPLATE.md).
