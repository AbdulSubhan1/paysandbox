import { describe, expect, it } from 'vitest';
import { TEST_CARDS } from '@/lib/card-guard/catalogue';
import { DECLINES, decideOutcome } from '@/lib/payments/outcome';
import { plainDeclineMessage } from './decline-message';

const failure = (code: string, decline_code: string | null, message = 'From the API.') => ({ code, decline_code, message });

describe('plainDeclineMessage', () => {
  it('leads with a plain sentence for insufficient funds', () => {
    expect(plainDeclineMessage(failure('card_declined', 'insufficient_funds'))).toBe(
      'Your bank declined this card: not enough funds. Try another card.',
    );
  });

  it('has its own sentence for every decline a test card can produce', () => {
    for (const card of TEST_CARDS) {
      const outcome = decideOutcome(card);
      if (outcome.kind !== 'failed') continue;
      const d = DECLINES[outcome.decline];
      const text = plainDeclineMessage(failure(d.code, d.declineCode));
      expect(text, card.key).not.toBe('From the API.');
      expect(text, card.key).not.toContain('_');
    }
  });

  it('covers a failed OTP check', () => {
    expect(plainDeclineMessage(failure('authentication_failed', null))).toMatch(/one-time code/);
  });

  it('falls back to the API message for an unknown code', () => {
    expect(plainDeclineMessage(failure('card_declined', 'stolen_card', 'Your card was declined.'))).toBe('Your card was declined.');
  });
});
