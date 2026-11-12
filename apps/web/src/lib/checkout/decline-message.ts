import { DECLINES, type DeclineReason } from '@/lib/payments/outcome';

/** What the customer reads first on the decline screen; the raw codes stay below for developers. */
const PLAIN: Record<DeclineReason, string> = {
  insufficient_funds: 'Your bank declined this card: not enough funds. Try another card.',
  expired_card: 'Your bank declined this card: it has expired. Try another card.',
  generic_decline: 'Your bank declined this card without giving a reason. Try another card.',
  incorrect_cvc: "Your bank declined this card: the CVC didn't match. Check it or try another card.",
  processing_error: "The card couldn't be processed this time. No money moved. Try again.",
  authentication_failed: "The one-time code check didn't pass, so you weren't charged. Try again or use another card.",
};

type Failure = { code: string; decline_code: string | null; message: string };

/** A plain sentence for a known decline; anything else falls back to the API's own message. */
export function plainDeclineMessage(failure: Failure): string {
  const reason = (Object.keys(DECLINES) as DeclineReason[]).find(
    (r) => DECLINES[r].code === failure.code && DECLINES[r].declineCode === failure.decline_code,
  );
  return reason ? PLAIN[reason] : failure.message;
}
