# Payment lifecycle

## States
| State | Meaning |
|---|---|
| **Processing** | The card was submitted and is being checked (shown briefly as "Processing…"). |
| **Requires action** | The bank wants an OTP (test card ending 3220). |
| **Succeeded** | Paid. |
| **Failed** | Declined, wrong OTP three times, cancelled at the OTP step, or the session expired during the OTP step. |
| **Partially refunded** | Part of the amount has been given back. |
| **Refunded** | The full amount has been given back. |
| **Disputed** | A dispute is open; refunds are blocked until it closes. |
| **Dispute lost** | The merchant lost the dispute (or did not answer in time). |

```
open session ──pay──▶ processing ──▶ succeeded ──partial refund──▶ partially refunded ──refund the rest──▶ refunded
                        │   │            │   ▲                               │
                        │   │            │   └── dispute won ◀──┐            │
                        │   │            └──dispute──▶ disputed ─┤◀───────────┘
                        │   │                                    └── dispute lost ──▶ dispute lost
                        │   └──▶ failed (decline)
                        └──▶ requires action ──OTP 123456──▶ succeeded
                                     └── 3 wrong codes / cancel / expiry ──▶ failed
```

## Checkout session states
- **Open**: can be paid. A declined attempt keeps it open so the customer can try another card.
- **Complete**: paid; opening the checkout again shows "already paid" with a link back to the merchant.
- **Expired**: 24 hours after it was created; opening it shows "expired" with a link to the merchant's cancel address.

## Rules
- The system shall allow only one payment attempt in progress per session at a time.
- The system shall expire an open session exactly 24 hours after it was created, and fail any payment still waiting for OTP on it, sending the "payment failed" event on time.
- The system shall allow refunds only on succeeded or partially refunded payments, never more than the amount left, and never while a dispute is open.
- The system shall make two refunds sent at the same moment unable to give back more than the amount left.
- The system shall open a dispute for the full amount left, with a respond-by date 7 days later.
- The system shall mark an unanswered dispute as lost on its respond-by date and send the "dispute closed" event.
- When a dispute is won, the system shall put the payment back in the state it had before the dispute.

## Events sent to the merchant
`payment.succeeded`, `payment.failed`, `payment.requires_action`, `refund.created`, `dispute.created`, `dispute.closed`. Each carries a snapshot of the object at that moment, amounts in the smallest unit of the project's currency with the `currency` code, and `livemode: false`.

## Open questions
- None.
