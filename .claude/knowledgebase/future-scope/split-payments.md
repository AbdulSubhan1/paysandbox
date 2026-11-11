# Split payments and connected sellers

**Wave 3 · Size L · Helps:** marketplaces, insurance brokers with partners, food delivery, platforms

## What it is
A **platform** project connects **sellers** (connected accounts). One customer payment is divided between them: for example the insurer gets the premium, a sister company gets the document-courier add-on, and the platform keeps a fee. The reference site shows exactly this: add-ons grouped by who fulfils them, and a note that the payment is split.

## How it should behave
- The platform invites or creates sellers; each seller has its own balance and (simulated) payout details.
- When starting a checkout, each line item can name the seller it belongs to; the platform can set a fee (percent or fixed).
- The customer sees one checkout and pays once.
- After payment, the dashboard shows the split: how much each seller and the platform got.
- **Refunds** take money back from the right seller (by line item, or in proportion for a full refund).
- **Disputes** take the disputed amount from the seller's balance; if that goes negative, it is recovered from their next sales.

## Rules
- The system shall make the split add up exactly to the amount paid, in the smallest currency unit, with any rounding remainder going to the platform.
- The system shall never let a seller see another seller's sales or the platform's fee rules.
- The system shall send webhooks to the platform for every split, refund reversal and dispute deduction.

## Balances and payouts
Needed first. Every project (and later every seller) gets a balance:
- **Pending:** paid recently, not yet released (a set number of days, simulated).
- **Available:** can be paid out.
- **Paid out:** sent in a (simulated) payout on a schedule (daily, weekly) or on demand, with a payout report.
- Refunds and lost disputes reduce the balance; a negative balance is shown clearly.

## Open questions
- Whether sellers get their own dashboard login or are managed only by the platform.
- How many days money stays pending before it is available.
