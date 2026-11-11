# Safety and limits

## Card safety
- The system shall refuse any card number that is not a PaySandbox test card, in the browser before anything is sent, and again on the server.
- In the card field, as soon as the first digits stop matching a test card, the system shall clear the field and say why. The refused digits never leave the customer's browser.
- The system shall never store full card numbers (even test ones), expiry dates, CVCs, OTP codes or full secret keys. A payment keeps only the card brand, the last 4 digits and which test card was used.
- The CVC is checked in the browser and never sent.

## Anti-phishing
- The system shall show the TEST MODE banner on every checkout screen. No merchant setting, address parameter or API field can hide or change it.
- The checkout footer says "This is a test payment page. Never enter a real card." with a report-abuse link.
- The system shall not let any other site show the checkout page inside a frame.
- The system shall refuse project names that copy real Pakistani bank or wallet names (HBL, UBL, Meezan, JazzCash, Easypaisa and similar). Names are 2–40 characters of plain text.

## Keys
- The secret key is shown **once**, when it is created or rolled. After that only its last 4 characters show.
- Rolling a key keeps the old one working for 24 hours, so the merchant can swap it without downtime.

## Webhook addresses
- The system shall accept only https addresses that reach the public internet; addresses pointing to private, local or cloud-metadata networks are refused when saved and again before every send.
- Local development uses a tunnel (for example ngrok), because PaySandbox cannot reach a developer's own computer.

## Daily caps (per project, per day, Pakistan time)
| Counted | Cap | Over the cap |
|---|---|---|
| API requests | 1,000 | Refused with "daily limit reached" until midnight |
| Checkout sessions created | 200 | Same |
| Webhook delivery attempts, including retries | 200 | Further deliveries wait for the next day |
| "Send test event" | 50 | Button disabled with a message |

- The developers page shows today's usage against each cap.
- Requests refused for the cap are counted but not added to the API request log, so abuse cannot fill the database.

## Sign-up
- Sign-up is invite-only: the admin adds GitHub usernames to an allowlist. Anyone else sees the "invite-only" page and no account is created.

## Data retention
- A daily clean-up removes data older than 90 days and expired retry keys, to stay inside the free database size.

## Open questions
- None.
