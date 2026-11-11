import { Webhook } from 'standardwebhooks';
import { describe, expect, it } from 'vitest';
import { newSigningSecret, signWebhook } from './signing';

const body = JSON.stringify({ id: 'evt_x', type: 'payment.succeeded' });

describe('signWebhook (verified with the official standardwebhooks library)', () => {
  it('makes a secret of whsec_ + base64 of 24 bytes', () => {
    expect(newSigningSecret()).toMatch(/^whsec_[A-Za-z0-9+/]{32}$/);
    expect(newSigningSecret()).not.toBe(newSigningSecret());
  });

  it('signs so a receiver verifies it (PS-WH-001)', () => {
    const secret = newSigningSecret();
    const at = new Date();
    const h = signWebhook([secret], 'evt_x', at, body);
    expect(h['webhook-id']).toBe('evt_x');
    expect(h['webhook-timestamp']).toBe(String(Math.floor(at.getTime() / 1000)));
    expect(h['webhook-signature']).toMatch(/^v1,/);
    expect(new Webhook(secret).verify(body, h)).toEqual(JSON.parse(body));
  });

  it('fails verification when the body changes by one byte (PS-WH-002)', () => {
    const secret = newSigningSecret();
    const h = signWebhook([secret], 'evt_x', new Date(), body);
    expect(() => new Webhook(secret).verify(body + ' ', h)).toThrow();
  });

  it('fails verification for a 6-minute-old timestamp (PS-WH-003)', () => {
    const secret = newSigningSecret();
    const old = signWebhook([secret], 'evt_x', new Date(Date.now() - 6 * 60_000), body);
    expect(() => new Webhook(secret).verify(body, old)).toThrow();
  });

  it('carries two signatures during a roll, and either secret verifies (PS-WH-016)', () => {
    const [older, newer] = [newSigningSecret(), newSigningSecret()];
    const h = signWebhook([newer, older], 'evt_x', new Date(), body);
    expect(h['webhook-signature'].split(' ')).toHaveLength(2);
    expect(new Webhook(older).verify(body, h)).toBeTruthy();
    expect(new Webhook(newer).verify(body, h)).toBeTruthy();
  });
});
