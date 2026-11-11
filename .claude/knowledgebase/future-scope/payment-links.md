# Payment links

**Wave 1 · Size M · Helps:** stores, services, events, insurance advisors (CRM)

## What it is
A link the merchant creates in the dashboard (or that the CRM creates through the API) and shares anywhere (WhatsApp, email, a social post). Opening it starts a fresh checkout for the set amount and items.

## How it should behave
- The merchant sets a title, amount or line items, optional quantity choice, and optionally: one-time or reusable, an expiry date, a maximum number of payments.
- Each opening creates its own checkout session, so payments, webhooks and refunds work exactly as today.
- The dashboard lists links with their payments and total collected; a link can be turned off.
- The reference site's "Request payment link" button is this feature: an advisor generates a link for one customer's chosen plan.

## Rules
- The system shall show the TEST MODE banner on every payment link.
- The system shall stop a one-time link after its first successful payment, and any link after its expiry or maximum.
- The system shall count link openings against the daily checkout-session cap.
- The system shall send a webhook for each payment made through a link, carrying the link's ID.

## Open questions
- Whether links get a short address (needs a domain; free tier has none).
