# Payments

**Area:** dashboard · **Who uses it:** merchant · **Reached from:** sidebar "Payments"

## What this page is for
Every test payment, newest first. Open one to see its timeline.

## What it shows
- A table of payments: amount, status badge, customer, card (brand and last 4), date and payment ID.
- Status filters: All, Succeeded, Failed, Partially refunded, Refunded, Needs OTP, Disputed.
- Pages of results with "next / previous".

## What the user can do
- Filter by status; filter to one customer (from the customers page).
- Page through older payments.
- Open a payment's detail.

## Rules
- The system shall list only this project's payments, newest first.
- The system shall keep paging stable while new payments arrive.
- The system shall show "No payments match this filter" when a filter has no results.

## Open questions
- None.

## Screenshots
![Payments](../assets/screenshots/dashboard/payments.png)
