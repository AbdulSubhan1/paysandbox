/** Real Pakistani banks, wallets and payment brands a test checkout must never look like. */
export const NAME_BLOCKLIST: readonly string[] = [
  'hbl', 'habib bank', 'ubl', 'united bank', 'meezan', 'mcb', 'allied bank', 'alfalah', 'standard chartered',
  'faysal', 'askari', 'bank islami', 'bankislami', 'jazzcash', 'easypaisa', 'sadapay', 'nayapay', 'raast', '1link',
  'paypal', 'stripe',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCKED = new RegExp(`(^|[^\\p{L}\\p{N}])(${NAME_BLOCKLIST.map(escape).join('|')})($|[^\\p{L}\\p{N}])`, 'iu');

export function validateMerchantName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 2 || name.length > 40) return 'Use 2 to 40 characters.';
  if (BLOCKED.test(name)) return 'This name looks like a real bank or wallet. Pick another name.';
  return null;
}
