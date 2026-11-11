# Affiliates and referral commissions

**Wave 3 · Size L · Helps:** stores, courses, SaaS, insurance (agents and partners), influencer marketing

## What it is
Partners (affiliates, influencers, agents) get a referral link or code. When a customer they referred pays, the partner earns a commission that the merchant can see, approve and pay out.

## How it should behave
- The merchant creates affiliates and commission rules: a percent or fixed amount, for all items or certain ones, optionally only the first purchase.
- A referral link or code is attached to a checkout (from the website's address or typed by the customer); the payment records which affiliate referred it.
- A commission is **pending** for a holding period (to cover refunds), then **approved**, then **paid** in a simulated payout.
- A refund lowers or cancels the commission; a lost dispute cancels it.
- Each affiliate gets a statement: clicks (if tracked by the site), sales, commissions by state.

## Rules
- The system shall calculate commissions in the smallest currency unit from the amount actually kept (after refunds).
- The system shall reverse a commission when its payment is refunded or a dispute is lost, even after it was approved.
- The system shall send webhooks when a commission is created, approved, reversed or paid, so a CRM can show it to the partner manager.

## Open questions
- Whether affiliates log in to see their own statement, or the merchant shares it.
