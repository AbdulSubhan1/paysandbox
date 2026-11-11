import { type CardBrand, TEST_CARDS, type TestCard } from './catalogue';

const CARD_LENGTH = 16;
const REFUSE_AFTER = 4; // digits typed before a non-matching number is refused

export type GuardResult =
  | { state: 'empty' }
  | { state: 'partial'; brand: CardBrand | null }
  | { state: 'complete'; card: TestCard }
  | { state: 'refused' };

/** Keeps ASCII digits only, at most 16. Other scripts' digits are dropped, never converted. */
export function normalizeDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, CARD_LENGTH);
}

export function guardCardInput(raw: string): GuardResult {
  const digits = normalizeDigits(raw);
  if (digits.length === 0) return { state: 'empty' };

  const matches = TEST_CARDS.filter((c) => c.number.startsWith(digits));
  if (matches.length === 0) {
    return digits.length >= REFUSE_AFTER ? { state: 'refused' } : { state: 'partial', brand: null };
  }
  if (digits.length === CARD_LENGTH) return { state: 'complete', card: matches[0] };
  return { state: 'partial', brand: matches[0].brand };
}

/** Exact match only: more than 16 digits is not a test card, even if it starts with one. */
export function findTestCard(raw: string): TestCard | null {
  if (raw.replace(/[^0-9]/g, '').length !== CARD_LENGTH) return null;
  const result = guardCardInput(raw);
  return result.state === 'complete' ? result.card : null;
}
