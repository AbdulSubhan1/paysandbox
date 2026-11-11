import { expect, test } from '@playwright/test';
import { E2E } from '../src/test/seed-e2e';
import { createSession, sessionBody } from './helpers';

test('the same Idempotency-Key replays the session @smoke', async ({ request }) => {
  const key = `order_${Date.now()}`;
  const send = () =>
    request.post('/api/v1/checkout_sessions', {
      headers: { authorization: `Bearer ${E2E.merchantA.sk}`, 'idempotency-key': key },
      data: sessionBody,
    });
  const first = await send();
  const second = await send();
  expect((await second.json()).id).toBe((await first.json()).id);
  expect(second.headers()['idempotent-replayed']).toBe('true');
});

test("merchant B gets 404 for merchant A's session @smoke", async ({ request }) => {
  const { id } = await createSession(request);
  const res = await request.get(`/api/v1/checkout_sessions/${id}`, { headers: { authorization: `Bearer ${E2E.merchantB.sk}` } });
  expect(res.status()).toBe(404);
});

test('a publishable or missing key is refused', async ({ request }) => {
  expect((await request.post('/api/v1/checkout_sessions', { data: sessionBody })).status()).toBe(401);
});
