const pkt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Dashboard times are Pakistan time, e.g. "11 Nov 2026, 6:51 pm". The API keeps unix seconds. */
export function formatPkt(d: Date): string {
  const p = Object.fromEntries(pkt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

export type PkrParse = { ok: true; paisa: number } | { ok: false; message: string };

const PKR = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** Turns a typed amount like "1,000.50" into integer paisa, from the digits themselves (no float math). */
export function parsePkrInput(raw: string): PkrParse {
  const text = raw.trim();
  const m = PKR.exec(text);
  if (!m) return { ok: false, message: 'Enter an amount in PKR, like 1,000 or 1000.50 (at most 2 decimals).' };
  const [whole, decimals = ''] = text.replaceAll(',', '').split('.');
  const paisa = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (paisa < 1) return { ok: false, message: 'Enter an amount above zero.' };
  return { ok: true, paisa };
}
