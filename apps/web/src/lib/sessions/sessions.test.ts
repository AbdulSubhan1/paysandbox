import { describe, expect, it } from 'vitest';
import { addHours } from '@/lib/time';
import { buildReturnUrl, effectiveSessionStatus } from './sessions';

describe('buildReturnUrl (Review Focus 3)', () => {
  it('adds pay= to a URL that already has a query string', () => {
    expect(buildReturnUrl('https://shop.test/thanks?ref=ig', 'pay_1')).toBe('https://shop.test/thanks?ref=ig&pay=pay_1');
  });
  it('adds pay= to a plain URL', () => {
    expect(buildReturnUrl('https://shop.test/thanks', 'pay_1')).toBe('https://shop.test/thanks?pay=pay_1');
  });
});

describe('effectiveSessionStatus', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  it('treats an open session past expires_at as expired', () => {
    expect(effectiveSessionStatus({ status: 'open', expiresAt: addHours(now, -1) }, now)).toBe('expired');
  });
  it('keeps open and complete sessions as they are', () => {
    expect(effectiveSessionStatus({ status: 'open', expiresAt: addHours(now, 1) }, now)).toBe('open');
    expect(effectiveSessionStatus({ status: 'complete', expiresAt: addHours(now, -1) }, now)).toBe('complete');
  });
});
