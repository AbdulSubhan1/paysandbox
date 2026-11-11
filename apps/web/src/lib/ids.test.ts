import { describe, expect, it } from 'vitest';
import { newId, randomBase62 } from './ids';

describe('newId', () => {
  it('uses the prefix plus 24 base62 characters', () => {
    expect(newId('pay')).toMatch(/^pay_[0-9A-Za-z]{24}$/);
    expect(newId('cs_test')).toMatch(/^cs_test_[0-9A-Za-z]{24}$/);
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 1000 }, () => newId('evt'))).size).toBe(1000);
  });
});

describe('randomBase62', () => {
  it('returns the requested length', () => {
    expect(randomBase62(32)).toMatch(/^[0-9A-Za-z]{32}$/);
  });
});
