import { describe, expect, it } from 'vitest';
import * as activity from './activity';

describe('payments/activity', () => {
  it('is where addActivity lives (it used to sit in pay.ts and caused an import cycle with disputes.ts)', () => {
    expect(typeof activity.addActivity).toBe('function');
  });
});
