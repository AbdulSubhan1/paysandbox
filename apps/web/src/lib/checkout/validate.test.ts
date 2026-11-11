import { describe, expect, it } from 'vitest';
import { EXPIRY_MESSAGES, parseExpiry, validateCvc, validateEmail, validateName } from './validate';

const now = new Date('2026-11-11T10:00:00Z');

describe('parseExpiry', () => {
  it.each(['1/29', '01/29', '01 / 29', '01/2029', '0129'])('accepts %s', (raw) => {
    expect(parseExpiry(raw, now)).toEqual({ ok: true, month: 1, year: 2029 });
  });

  it('accepts the current month (PS-FV-003)', () => {
    expect(parseExpiry('11/26', now)).toMatchObject({ ok: true, month: 11, year: 2026 });
  });

  it('refuses last month (PS-FV-004)', () => {
    expect(parseExpiry('10/26', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.past });
  });

  it.each(['13/29', '00/29'])('refuses month %s (PS-FV-005)', (raw) => {
    expect(parseExpiry(raw, now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.month });
  });

  it('refuses more than 20 years ahead (PS-FV-006)', () => {
    expect(parseExpiry('12/47', now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.far });
  });

  it.each(['1/2', '', 'ab/cd', '1/2/29'])('refuses badly formed %j', (raw) => {
    expect(parseExpiry(raw, now)).toEqual({ ok: false, message: EXPIRY_MESSAGES.format });
  });
});

describe('validateEmail (PS-FV-001/002)', () => {
  it('requires an email', () => expect(validateEmail('  ')).toBe('Enter your email.'));
  it.each(['ayesha@', 'ayesha.example.com', 'a@b'])('refuses %s', (raw) => {
    expect(validateEmail(raw)).toBe('Enter a valid email, like name@example.com.');
  });
  it('accepts a normal email', () => expect(validateEmail('ayesha@example.com')).toBeNull());
});

describe('validateCvc (PS-FV-007)', () => {
  it('accepts exactly 3 digits', () => expect(validateCvc('123')).toBeNull());
  it.each(['12', '1234', 'abc', ''])('refuses %j', (raw) => expect(validateCvc(raw)).not.toBeNull());
});

describe('validateName (PS-FV-008)', () => {
  it('requires a name', () => expect(validateName('  ')).toBe('Enter the name on the card.'));
  it('accepts an Urdu name', () => expect(validateName('عائشہ خان')).toBeNull());
  it('refuses more than 100 characters', () => expect(validateName('x'.repeat(101))).not.toBeNull());
});
