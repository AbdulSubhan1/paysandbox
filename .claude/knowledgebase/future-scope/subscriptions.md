# Recurring payments

**Wave 4 · Helps:** SaaS, gyms, schools, memberships, insurance instalments

## Saved cards
**Size M.** At checkout the customer can tick "Save this card". The merchant can later charge that saved test card from their server without the customer being present.
- Saved cards keep only brand, last 4 and which test card, the same as payments.
- Special test cards fail later charges (for example "declines on renewal"), so merchants learn to handle it.
- The customer's saved cards are listed on the customer page and can be removed.

## Test clock
**Size M.** A project can move its own time forward (1 day, 1 month…) to see renewals, session expiries, dispute deadlines and payout dates happen immediately, instead of waiting. Essential for demos.

## Subscriptions
**Size L.**
- The merchant defines plans with a price and period (monthly, yearly) and an optional trial.
- The first payment goes through the hosted checkout and saves the card; renewals charge it automatically.
- A failed renewal is retried on a schedule; after the last retry the subscription is cancelled or marked unpaid.
- Customers can cancel now or at the period end; plan changes are charged or credited in proportion.
- Webhooks: subscription created, renewed, payment failed, cancelled.

## Instalment plans
**Size M.** The total is split into 3 or 4 payments: the first now, the rest charged to the saved card on set dates. Missed instalments follow the same retry rules. Fits insurance premiums and big purchases (a simulated "pay later" option like the reference site's).

## Rules
- The system shall charge renewals and instalments only to cards the customer chose to save.
- The system shall cap renewals and retries per day like every other timed job.

## Open questions
- How many renewal retries, and how far apart.
