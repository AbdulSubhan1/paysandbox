# Integrations

## Connecting any merchant site
What a developer needs, in order:
1. Sign in (invited GitHub account) and create a project; copy the secret key once.
2. On their server, create a checkout session with the secret key and send the customer to the returned address.
3. Set a webhook address on the Webhooks page, copy the signing secret, and verify every webhook with it.
4. Mark orders paid, refunded or disputed from webhooks.
5. Watch payments, refunds, disputes and every webhook attempt in the dashboard.

Goal: from sign-up to a verified test payment in under 15 minutes.

## The insurance website (planned)
A separate website, inspired by the flow of a UAE insurance comparison site, that acts as a **real-world merchant** of PaySandbox. It is being designed in its own session.

Step 1 (agreed):
- A visitor fills a lead form → sees plans → picks a plan with add-ons → pays on the PaySandbox hosted checkout → lands on a thank-you page.
- Add-ons are per plan: **included** (sent as a line item at 0), **optional paid**, or **pre-ticked**. Everything goes to PaySandbox as **one payment with line items**, in a **USD project** so amounts match PolicyDesk.
- An advisor is shown in the website header from the plans page on.
- The `payment.succeeded` webhook marks the order paid.

After step 1, each PaySandbox scenario becomes one small website step, so both products grow together: declined card, OTP, refund from the dashboard, dispute, webhook retries while the website is down.

## The CRM (PolicyDesk, planned)
PolicyDesk is Abdul's existing CRM (separate project) with opportunities that convert to leads, coordinator and advisor roles, an insurers and plans catalogue, and payment states.

Planned link:
- The website creates the lead in PolicyDesk when the form is submitted.
- PaySandbox webhooks (paid, refunded, disputed) update the lead's payment status in PolicyDesk, so advisors see it without asking.
- Later: advisors send a **payment link** to a customer from PolicyDesk (see [Future scope](../future-scope/README.md)).

## Open questions
- Whether the CRM receives PaySandbox webhooks directly or through the website.
- Which PolicyDesk payment states map to which PaySandbox events.
