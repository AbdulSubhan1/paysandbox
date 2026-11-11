import type { TestCard } from '@/lib/card-guard/catalogue';

export type DeclineReason =
  | 'insufficient_funds'
  | 'expired_card'
  | 'generic_decline'
  | 'incorrect_cvc'
  | 'processing_error'
  | 'authentication_failed';

export type Decline = { code: string; declineCode: string | null; message: string };

export const DECLINES: Record<DeclineReason, Decline> = {
  insufficient_funds: { code: 'card_declined', declineCode: 'insufficient_funds', message: 'Your card has insufficient funds.' },
  expired_card: { code: 'expired_card', declineCode: null, message: 'Your card has expired.' },
  generic_decline: { code: 'card_declined', declineCode: 'generic_decline', message: 'Your card was declined.' },
  incorrect_cvc: { code: 'incorrect_cvc', declineCode: null, message: "Your card's security code is incorrect." },
  processing_error: {
    code: 'processing_error',
    declineCode: null,
    message: 'Something went wrong while processing your card. Try again.',
  },
  authentication_failed: {
    code: 'authentication_failed',
    declineCode: null,
    message: 'The OTP check failed, so the payment was not made.',
  },
};

export type Outcome = { kind: 'succeeded' } | { kind: 'requires_action' } | { kind: 'failed'; decline: DeclineReason };

export function decideOutcome(card: TestCard): Outcome {
  switch (card.outcome) {
    case 'succeeded':
    case 'dispute': // succeeds now; the dispute opens later (Plan 2)
      return { kind: 'succeeded' };
    case 'three_ds':
      return { kind: 'requires_action' };
    default:
      return { kind: 'failed', decline: card.outcome };
  }
}

/** The stored codes back to the full decline, for replays. */
export function declineFor(code: string | null, declineCode: string | null): Decline | undefined {
  return Object.values(DECLINES).find((d) => d.code === code && d.declineCode === declineCode);
}
