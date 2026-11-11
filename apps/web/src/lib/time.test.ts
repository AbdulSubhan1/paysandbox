import { describe, expect, it } from 'vitest';
import { addHours, karachiDay, secondsUntilKarachiMidnight } from './time';

describe('karachi time', () => {
  it('rolls the day over at Karachi midnight, not UTC midnight', () => {
    expect(karachiDay(new Date('2026-11-11T18:59:59Z'))).toBe('2026-11-11');
    expect(karachiDay(new Date('2026-11-11T19:30:00Z'))).toBe('2026-11-12');
  });

  it('counts seconds to the next Karachi midnight', () => {
    expect(secondsUntilKarachiMidnight(new Date('2026-11-11T19:30:00Z'))).toBe(23.5 * 3600);
    expect(secondsUntilKarachiMidnight(new Date('2026-11-11T18:59:59Z'))).toBe(1);
  });

  it('adds hours', () => {
    expect(addHours(new Date('2026-11-11T00:00:00Z'), 24).toISOString()).toBe('2026-11-12T00:00:00.000Z');
  });
});
