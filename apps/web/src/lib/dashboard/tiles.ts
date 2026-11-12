import type { Overview } from './overview';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The "Refunded and disputed" tile counts money that left: refunds and lost disputes. Open disputes are on hold. */
export function refundedAndDisputed(o: Pick<Overview, 'refunded' | 'disputesLost' | 'disputesOpen'>): { amount: number; caption: string } {
  const parts = [
    o.refunded.count && plural(o.refunded.count, 'refund'),
    o.disputesLost.count && plural(o.disputesLost.count, 'dispute lost', 'disputes lost'),
    o.disputesOpen.count && `${plural(o.disputesOpen.count, 'open dispute')} on hold`,
  ].filter(Boolean);
  return { amount: o.refunded.amount + o.disputesLost.amount, caption: parts.length ? parts.join(' · ') : 'none in this range' };
}

/** "12 payments · 86% of attempts". Attempts are succeeded plus declined; waiting-for-OTP payments are not counted. */
export function successfulCaption(s: Overview['successful']): string {
  const count = plural(s.count, 'payment');
  return s.rate === null ? count : `${count} · ${Math.round(s.rate * 100)}% of attempts`;
}
