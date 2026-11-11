import { describe, expect, it } from 'vitest';
import { formatPkt, parseAmountInput } from './format';

describe('formatPkt (PS-DB-007)', () => {
  it('shows Pakistan time, day first, 12-hour clock', () => {
    expect(formatPkt(new Date('2026-11-11T13:51:00Z'))).toBe('11 Nov 2026, 6:51 pm');
  });
  it('rolls over to the next day after 19:00 UTC', () => {
    expect(formatPkt(new Date('2026-11-11T19:30:00Z'))).toBe('12 Nov 2026, 12:30 am');
  });
});

describe('parseAmountInput (PS-DB-008, Plan 3 Review Focus 2)', () => {
  it.each([
    ['1,000.50', 100050],
    [' 5100 ', 510000],
    ['0.1', 10],
    ['0.29', 29],
    ['1,234,567.89', 123456789],
  ])('%j → %i in the smallest unit', (raw, amount) => expect(parseAmountInput(raw, 'pkr')).toEqual({ ok: true, amount }));

  it.each(['1000.505', '0', '0.00', '-5', 'abc', '', '1,00,0', '1e3', '.5', '5.'])('refuses %j', (raw) => {
    const r = parseAmountInput(raw, 'pkr');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });
});

describe('parseAmountInput names the project currency', () => {
  it('says USD for a USD project', () => {
    const r = parseAmountInput('abc', 'usd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('USD');
  });
});
