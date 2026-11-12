import { karachiDay } from '@/lib/time';

/** Date ranges the dashboard offers, as `?range=` values. A range is whole Karachi days, ending today. */
export const RANGES = { '7d': 7, '14d': 14, '30d': 30 } as const;
export type Range = keyof typeof RANGES;

export const RANGE_LABEL: Record<Range, string> = { '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days' };

export const isRange = (v: unknown): v is Range => typeof v === 'string' && Object.hasOwn(RANGES, v);

const DAY_MS = 24 * 60 * 60 * 1000;
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no daylight saving (lib/time.ts)

/** The range's Karachi days, oldest first, e.g. 14 `YYYY-MM-DD` strings ending with today. */
export function rangeDays(range: Range, now: Date): string[] {
  return Array.from({ length: RANGES[range] }, (_, i) => karachiDay(new Date(now.getTime() - (RANGES[range] - 1 - i) * DAY_MS)));
}

/** The first instant of the range: Karachi midnight at the start of its first day. */
export function rangeStart(range: Range, now: Date): Date {
  return new Date(Date.parse(`${rangeDays(range, now)[0]}T00:00:00Z`) - KARACHI_OFFSET_MS);
}

const shortDayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** `2026-10-30` → `30 Oct`. */
export function shortDay(day: string): string {
  return shortDayFormat.format(new Date(`${day}T00:00:00Z`));
}
