import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from './report';

afterEach(() => vi.restoreAllMocks());

describe('reportError', () => {
  it('records where, the error name and code, never the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = Object.assign(new Error('insert failed for 4242424242424242'), { code: '57P01' });
    reportError('checkout.pay', e);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('checkout.pay');
    expect(logged).toContain('57P01');
    expect(logged).toContain('Error');
    expect(logged).not.toContain('4242');
  });
});
