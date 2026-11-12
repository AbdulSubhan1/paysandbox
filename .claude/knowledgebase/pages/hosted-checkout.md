# Hosted checkout

**Area:** checkout · **Who uses it:** the merchant's customer · **Reached from:** the merchant's site redirects here

## What this page is for
PaySandbox's own payment page. The customer pays a checkout session with a test card, then goes back to the merchant's site.

## What it shows
- The TEST MODE strip, always: a slim dark bar (28 px) with hazard stripes either side of "TEST MODE · no real money moves".
- The merchant's name with its initial (always a capital letter) and the order summary: line items and the total in the project's currency. A line shows "Qty N" only when N is more than 1, and a line that costs nothing shows "Included".
- A card form (email, name, card number, expiry, CVC) and a picker with the main test cards.
- After paying: a success screen with a button back to the merchant, or a decline screen that leads with a plain sentence (for example "Your bank declined this card: not enough funds. Try another card."), shows the raw codes as small "For developers" text, and offers "Try another card".
- For card 3220: the simulated "Sandbox Bank" OTP screen.
- **On a phone** the card form comes first. The order is folded into one line at the top, "Order summary · 3 items  USD 1,140.00", which opens to show the lines. The success or decline screen replaces the page, so it is visible without scrolling.
- An "already paid" page for a paid session and an "expired" page for an expired one, each linking back to the merchant.
- "Checkout not found" for a wrong address.

## What the user can do
- Pick a test card or type one; pay. Picking a card also fills an empty expiry (12 / 34) and CVC (123); anything already typed there is kept.
- Enter the OTP (123456) or cancel it.
- Try another card after a decline (the declined attempt stays in the history).
- Return to the merchant's site.

## Rules
- The system shall accept only test card numbers (see [Test cards](test-cards.md)).
- The system shall keep the card field disabled until the page is ready, so nothing typed early is lost.
- The system shall fail the payment after 3 wrong OTP codes or a cancel.
- The system shall send the customer back to the merchant's success address with the payment ID, or to the cancel address.
- The system shall never let another site frame this page.

## Open questions
- None.

## Screenshots
![Hosted checkout](../assets/screenshots/checkout/checkout.png)
![OTP screen](../assets/screenshots/checkout/otp.png)
![Checkout on a phone](../assets/screenshots/checkout/checkout-phone.png)
![Result on a phone](../assets/screenshots/checkout/result-phone.png)
