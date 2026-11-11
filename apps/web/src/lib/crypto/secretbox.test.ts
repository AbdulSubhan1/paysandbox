import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret } from './secretbox';

/** Flips one bit of the ciphertext itself (editing a base64 character can change only padding bits). */
const tamper = (box: string) => {
  const parts = box.split('.');
  const ct = Buffer.from(parts[3], 'base64url');
  ct[0] ^= 1;
  return [...parts.slice(0, 3), ct.toString('base64url')].join('.');
};

afterEach(() => vi.unstubAllEnvs());

describe('secretbox', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret('whsec_abc'))).toBe('whsec_abc');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
    expect(encryptSecret('x')).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('refuses a tampered box', () => {
    expect(() => decryptSecret(tamper(encryptSecret('x')))).toThrow();
  });

  it('needs a 32-byte WEBHOOK_SECRET_KEY', () => {
    vi.stubEnv('WEBHOOK_SECRET_KEY', '');
    expect(() => encryptSecret('x')).toThrow('WEBHOOK_SECRET_KEY is not set');
    vi.stubEnv('WEBHOOK_SECRET_KEY', Buffer.alloc(16).toString('base64'));
    expect(() => encryptSecret('x')).toThrow('WEBHOOK_SECRET_KEY is not set');
  });
});
