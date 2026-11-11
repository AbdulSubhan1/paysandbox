import { expect, test } from '@playwright/test';
import { Webhook } from 'standardwebhooks';
import { createSession, fillCheckout, newMerchant, payButton, payViaApi, runJobs, setEndpointFor } from './helpers';
import { type Received, startReceiver } from './receiver';

const event = (r: Received) => JSON.parse(r.body) as { id: string; type: string; data: { object: Record<string, unknown> } };
const ofType = (received: Received[], type: string) => received.filter((r) => event(r).type === type);

test('a paid checkout sends a signed payment.succeeded webhook (PS-WH-001) @smoke', async ({ page, request }) => {
  const receiver = await startReceiver([200]);
  const m = await newMerchant();
  const secret = await setEndpointFor(m.id, receiver.url);
  await page.goto((await createSession(request, m.sk)).url);
  await fillCheckout(page, '4242424242424242');
  await payButton(page).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();

  await expect.poll(() => ofType(receiver.received, 'payment.succeeded').length, { timeout: 15_000 }).toBe(1);
  const [hook] = ofType(receiver.received, 'payment.succeeded');
  expect(new Webhook(secret).verify(hook.body, hook.headers)).toMatchObject({ object: 'event', livemode: false });
  expect(event(hook).data.object).toMatchObject({ object: 'payment', status: 'succeeded', amount: 510000 });
  await receiver.close();
});

test('a webhook that gets a 500 is retried with the same webhook-id (PS-WH-004)', async ({ request }) => {
  const receiver = await startReceiver([500, 200]);
  const m = await newMerchant();
  await setEndpointFor(m.id, receiver.url);
  const { id } = await createSession(request, m.sk);
  await payViaApi(request, id, '4242424242424242');
  await expect.poll(() => receiver.received.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await runJobs(request, 61);
  await expect.poll(() => receiver.received.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  expect(receiver.received[1].headers['webhook-id']).toBe(receiver.received[0].headers['webhook-id']);
  await receiver.close();
});

test('a full refund through the API sends refund.created (PS-RF-001) @smoke', async ({ request }) => {
  const receiver = await startReceiver([200]);
  const m = await newMerchant();
  await setEndpointFor(m.id, receiver.url);
  const { id } = await createSession(request, m.sk);
  const paid = await payViaApi(request, id, '4242424242424242');
  const res = await request.post('/api/v1/refunds', {
    headers: { authorization: `Bearer ${m.sk}` },
    data: { payment: paid.payment_id, reason: 'requested_by_customer' },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ object: 'refund', amount: 510000, payment: paid.payment_id });
  const payment = await (await request.get(`/api/v1/payments/${paid.payment_id}`, { headers: { authorization: `Bearer ${m.sk}` } })).json();
  expect(payment).toMatchObject({ status: 'refunded', amount_refunded: 510000 });
  await expect.poll(() => ofType(receiver.received, 'refund.created').length, { timeout: 15_000 }).toBe(1);
  await receiver.close();
});

test('card 0259 opens a dispute about a minute after paying', async ({ request }) => {
  const receiver = await startReceiver([200]);
  const m = await newMerchant();
  await setEndpointFor(m.id, receiver.url);
  const { id } = await createSession(request, m.sk);
  const paid = await payViaApi(request, id, '4000000000000259');
  expect(paid.status).toBe('succeeded');
  await runJobs(request, 61);
  await expect.poll(() => ofType(receiver.received, 'dispute.created').length, { timeout: 15_000 }).toBe(1);
  expect(event(ofType(receiver.received, 'dispute.created')[0]).data.object).toMatchObject({ object: 'dispute', amount: 510000, payment: paid.payment_id });
  await receiver.close();
});
