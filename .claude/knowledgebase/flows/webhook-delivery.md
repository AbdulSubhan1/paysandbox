# Webhook delivery

1. Something happens (a payment succeeds, a refund is made…) and PaySandbox records an **event**.
2. If the project has an enabled webhook address, PaySandbox sends the event there, signed with the project's signing secret (Standard Webhooks format).
3. A 2xx answer means **delivered**. Anything else, a timeout (10 seconds) or a network error is a failed attempt.
4. Failed attempts are retried after 1 min, 5 min, 30 min, 2 h and 6 h. After the 6th failed attempt the delivery is **failed**.
5. After **20 failed events in a row** the address is disabled, and the dashboard shows a banner with a re-enable button.
6. The developer can see every attempt on the event page and **Resend now**.

## What the merchant's server must do
- Check the signature with the signing secret before trusting the message.
- Treat the webhook ID as unique: the same event can arrive more than once (retries, resends), and events may arrive out of order.
- Answer quickly with a 2xx, then do slow work afterwards.

## Rules
- The system shall keep the same webhook ID on every attempt of an event.
- The system shall not follow redirects and shall read at most 64 KB of the answer.
- The system shall pause further deliveries for the day once the project reaches 200 delivery attempts.
