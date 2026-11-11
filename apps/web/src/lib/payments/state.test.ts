import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from './state';

describe('canTransition (design §6)', () => {
  it.each([
    [null, 'succeeded'],
    [null, 'failed'],
    [null, 'requires_action'],
    ['requires_action', 'succeeded'],
    ['requires_action', 'failed'],
    ['succeeded', 'partially_refunded'],
    ['succeeded', 'refunded'],
    ['succeeded', 'disputed'],
    ['partially_refunded', 'partially_refunded'],
    ['partially_refunded', 'refunded'],
    ['partially_refunded', 'disputed'],
    ['disputed', 'succeeded'],
    ['disputed', 'partially_refunded'],
    ['disputed', 'dispute_lost'],
  ] as const)('allows %s → %s', (from, to) => expect(canTransition(from, to)).toBe(true));

  it.each([
    ['failed', 'refunded'],
    ['failed', 'disputed'],
    ['requires_action', 'refunded'],
    ['refunded', 'partially_refunded'],
    ['refunded', 'disputed'],
    ['disputed', 'refunded'],
    ['dispute_lost', 'succeeded'],
    [null, 'refunded'],
  ] as const)('refuses %s → %s', (from, to) => expect(canTransition(from, to)).toBe(false));
});

describe('assertTransition', () => {
  it('passes a legal change and throws on an illegal one', () => {
    expect(() => assertTransition('requires_action', 'failed')).not.toThrow();
    expect(() => assertTransition('refunded', 'succeeded')).toThrow('Illegal payment status change: refunded → succeeded');
  });
});
