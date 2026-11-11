import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/client';
import { addHours } from '@/lib/time';
import { callRoute } from '@/test/api';
import { createTestDb } from '@/test/db';
import { makeMerchant, makeSession } from '@/test/factories';
import { POST as OTP } from '../otp/route';
import { POST } from './route';

let db: Db;
let sessionId: string;
const valid = { attempt_id: 'a1', email: 'ayesha@example.com', name: 'Ayesha Khan', card_number: '4242 4242 4242 4242', expiry: '12 / 29' };
const pay = (body: unknown, id = sessionId) => callRoute(POST, { body, params: { sessionId: id }, path: `/c/${id}/pay` });

beforeEach(async () => {
  db = await createTestDb();
  const m = await makeMerchant(db);
  sessionId = (await makeSession(db, m.id, { expiresAt: addHours(new Date(), 24) })).id;
});
afterEach(() => vi.restoreAllMocks());

describe('POST /c/{id}/pay', () => {
  it('pays with a test card and returns where to send the customer', async () => {
    const res = await pay(valid);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.json).toMatchObject({ status: 'succeeded', payment_id: expect.stringMatching(/^pay_/), return_url: expect.stringContaining('pay=') });
  });

  it('refuses a real-looking card and logs nothing about it (PS-CG-010/012)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const res = await pay({ ...valid, card_number: '5398228347291056' });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('card_not_test_card');
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('5398');
  });

  it('refuses a body that contains a CVC: the browser must never send it', async () => {
    const res = await pay({ ...valid, cvc: '123' });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('cvc_not_accepted');
  });

  it('returns the same payment for a retried attempt id (Review Focus 1)', async () => {
    const first = await pay(valid);
    const retry = await pay(valid);
    expect(retry.json.payment_id).toBe(first.json.payment_id);
  });

  it('answers 409 to a second payment on a paid session', async () => {
    await pay(valid);
    const second = await pay({ ...valid, attempt_id: 'a2' });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe('session_complete');
  });

  it('answers 404 for an unknown session and 400 naming a bad field', async () => {
    expect((await pay(valid, 'cs_test_nope')).status).toBe(404);
    const bad = await pay({ ...valid, email: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: 'invalid_field', field: 'email' });
    expect((await pay({ ...valid, attempt_id: 7 })).json.error).toMatchObject({ code: 'invalid_field', field: 'attempt_id' });
  });
});

describe('POST /c/{id}/otp', () => {
  it('finishes a 3-D Secure payment with the test OTP', async () => {
    const started = await pay({ ...valid, card_number: '4000000000003220' });
    expect(started.json.status).toBe('requires_action');
    const otp = (body: unknown) => callRoute(OTP, { body, params: { sessionId }, path: `/c/${sessionId}/otp` });
    expect((await otp({ payment_id: started.json.payment_id, code: '000000' })).json).toMatchObject({ status: 'requires_action', attempts_left: 2 });
    expect((await otp({ payment_id: started.json.payment_id, code: '123456' })).json.status).toBe('succeeded');
  });

  it('cancels', async () => {
    const started = await pay({ ...valid, card_number: '4000000000003220' });
    const res = await callRoute(OTP, { body: { payment_id: started.json.payment_id, cancel: true }, params: { sessionId } });
    expect(res.json).toMatchObject({ status: 'failed', failure: { code: 'authentication_failed' } });
  });
});
