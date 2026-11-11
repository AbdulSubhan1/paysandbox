# Card form inside the merchant's page

**Wave 5 · Size L · Helps:** any merchant who wants checkout without a redirect

## What it is
Today the customer leaves the merchant's site and pays on PaySandbox's own page. This feature puts PaySandbox's card form **inside** the merchant's checkout page (like Stripe Elements), as the reference site does with its inline card fields.

## How it should behave
- The merchant adds a small PaySandbox script to their page; the card fields load from PaySandbox inside a frame, so card digits never touch the merchant's page.
- The same card guard runs inside the frame: only test cards, refused digits never sent.
- The OTP screen opens over the merchant's page.
- The merchant's server confirms the payment with its secret key and gets the same webhooks as today.

## Rules
- The system shall show the TEST MODE label **inside the frame**, where the merchant cannot cover or restyle it.
- The system shall load the card frame only on the addresses the merchant registered.
- The system shall keep refusing to show the full hosted checkout inside a frame; only the card fields are embeddable.

## Open questions
- This was left out of v1 on purpose to avoid phishing look-alikes. Abdul to confirm it is worth the extra anti-phishing work.
