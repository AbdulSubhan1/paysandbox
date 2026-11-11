const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Karachi is UTC+5 with no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' });

/** The calendar day in Karachi, as `YYYY-MM-DD`. */
export function karachiDay(now: Date): string {
  return dayFormat.format(now);
}

export function secondsUntilKarachiMidnight(now: Date): number {
  const local = now.getTime() + KARACHI_OFFSET_MS;
  const nextMidnight = Math.floor(local / DAY_MS + 1) * DAY_MS;
  return Math.ceil((nextMidnight - local) / 1000);
}

export function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}
