import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/test/db';
import { handleCheckoutPost } from './checkout-http';

beforeEach(async () => {
  await createTestDb();
});
afterEach(() => vi.restoreAllMocks());

const req = (body: unknown) => new Request('http://localhost/c/cs_test_1/pay', { method: 'POST', body: JSON.stringify(body) });

describe('handleCheckoutPost', () => {
  it('reports unexpected errors by name and answers 500 without echoing the body', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleCheckoutPost(req({ card_number: '4242424242424242' }), async () => {
      throw new Error('db down');
    });
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain('4242');
  });

  it('answers 429 when a checkout has had too many attempts', async () => {
    const { PayError } = await import('./pay');
    const res = await handleCheckoutPost(req({}), async () => {
      throw new PayError('too_many_attempts', 'Too many payment attempts.');
    });
    expect(res.status).toBe(429);
  });
});
