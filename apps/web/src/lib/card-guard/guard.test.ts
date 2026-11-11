import { describe, expect, it } from 'vitest';
import { TEST_CARDS } from './catalogue';
import { findTestCard, guardCardInput, normalizeDigits } from './guard';

describe('TEST_CARDS', () => {
  it('has the 9 published cards, each number once', () => {
    expect(TEST_CARDS).toHaveLength(9);
    expect(new Set(TEST_CARDS.map((c) => c.number)).size).toBe(9);
  });

  it('shows 4242, 9995, 3220 and 0069 in checkout', () => {
    expect(TEST_CARDS.filter((c) => c.showInCheckout).map((c) => c.number.slice(-4))).toEqual(['4242', '9995', '3220', '0069']);
  });
});

describe('guardCardInput', () => {
  it('accepts a full test card (PS-CG-001)', () => {
    expect(guardCardInput('4242 4242 4242 4242')).toEqual({
      state: 'complete',
      card: expect.objectContaining({ key: 'visa_success', brand: 'visa' }),
    });
  });

  it('refuses 4 digits that start no test card (PS-CG-002)', () => {
    expect(guardCardInput('5398')).toEqual({ state: 'refused' });
  });

  it('waits until 4 digits before refusing (PS-CG-003)', () => {
    expect(guardCardInput('539')).toEqual({ state: 'partial', brand: null });
  });

  it('refuses a pasted real-looking number with separators (PS-CG-004/005)', () => {
    expect(guardCardInput('5398-2283-4729-1056')).toEqual({ state: 'refused' });
  });

  it('refuses a test-card prefix followed by a wrong digit (PS-CG-006)', () => {
    expect(guardCardInput('4242 4243')).toEqual({ state: 'refused' });
  });

  it('is partial at 15 digits of a test card (PS-CG-007)', () => {
    expect(guardCardInput('424242424242424')).toEqual({ state: 'partial', brand: 'visa' });
  });

  it('is partial with the brand while a prefix matches', () => {
    expect(guardCardInput('5555')).toEqual({ state: 'partial', brand: 'mastercard' });
  });

  it('is empty for no digits', () => {
    expect(guardCardInput('')).toEqual({ state: 'empty' });
    expect(guardCardInput('abc')).toEqual({ state: 'empty' });
  });
});

describe('normalizeDigits', () => {
  it('keeps at most 16 digits (PS-CG-008)', () => {
    expect(normalizeDigits('42424242424242421234')).toHaveLength(16);
  });

  it('drops non-ASCII digits, letters and emoji (PS-CG-009)', () => {
    expect(normalizeDigits('٤٢٤٢ abc 😀')).toBe('');
  });
});

describe('findTestCard', () => {
  it('finds an exact 16-digit test card', () => {
    expect(findTestCard('4000 0000 0000 3220')?.outcome).toBe('three_ds');
  });

  it('returns null for real-looking or partial numbers', () => {
    expect(findTestCard('4111111111111111')).toBeNull();
    expect(findTestCard('4242')).toBeNull();
  });

  it('returns null when more than 16 digits were sent', () => {
    expect(findTestCard('42424242424242421234')).toBeNull();
  });
});
