export const EXPIRY_MESSAGES = {
  format: 'Enter the expiry date as MM / YY.',
  month: 'Enter a month from 01 to 12.',
  past: 'This expiry date is in the past.',
  far: 'Enter a real expiry year.',
} as const;

const MAX_YEARS_AHEAD = 20;

export type ExpiryResult = { ok: true; month: number; year: number } | { ok: false; message: string };

/** Accepts M/YY, MM/YY, MM / YY, MM/YYYY and MMYY. Uses the Karachi calendar month for "past". */
export function parseExpiry(raw: string, now: Date): ExpiryResult {
  const compact = raw.replace(/\s/g, '');
  const match = /^(\d{1,2})\/(\d{2}|\d{4})$/.exec(compact) ?? /^(\d{2})(\d{2})$/.exec(compact);
  if (!match) return { ok: false, message: EXPIRY_MESSAGES.format };

  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (month < 1 || month > 12) return { ok: false, message: EXPIRY_MESSAGES.month };

  const [nowYear, nowMonth] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  if (year < nowYear || (year === nowYear && month < nowMonth)) return { ok: false, message: EXPIRY_MESSAGES.past };
  if (year > nowYear + MAX_YEARS_AHEAD) return { ok: false, message: EXPIRY_MESSAGES.far };
  return { ok: true, month, year };
}

export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return 'Enter your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email, like name@example.com.';
  return null;
}

export function validateCvc(raw: string): string | null {
  return /^\d{3}$/.test(raw.trim()) ? null : 'Enter the 3-digit CVC from the back of the card.';
}

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return 'Enter the name on the card.';
  if (name.length > 100) return 'Use 100 characters or fewer.';
  return null;
}
