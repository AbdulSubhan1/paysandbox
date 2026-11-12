import type { Currency } from '@/lib/currency';
import { shortDay } from '@/lib/dashboard/range';
import { formatMoney } from '@/lib/money';

/** One bar per day; today is darker. Plain CSS bars, described for screen readers by the label. */
export function VolumeChart({ daily, currency, rangeLabel }: { daily: { day: string; amount: number }[]; currency: Currency; rangeLabel: string }) {
  const max = Math.max(...daily.map((d) => d.amount), 0);
  const top = daily.reduce((a, b) => (b.amount > a.amount ? b : a), daily[0]);
  const total = daily.reduce((n, d) => n + d.amount, 0);
  const label = max
    ? `Bar chart of successful volume per day, ${rangeLabel.toLowerCase()}: ${formatMoney(total, currency)} in total, highest ${formatMoney(top.amount, currency)} on ${shortDay(top.day)}.`
    : `No successful payments ${rangeLabel.toLowerCase()}.`;
  const today = daily[daily.length - 1];
  return (
    <div>
      <div role="img" aria-label={label} className="mt-4 flex h-40 items-end gap-1 border-b border-input">
        {daily.map((d, i) => (
          <span
            key={d.day}
            title={`${shortDay(d.day)}: ${formatMoney(d.amount, currency)}`}
            className={`min-w-0 flex-1 rounded-t-sm ${i === daily.length - 1 ? 'bg-primary' : 'bg-primary/40'}`}
            style={{ height: max ? `${(d.amount / max) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{shortDay(daily[0].day)}</span>
        <span>
          Today · <span className="tabular-nums">{formatMoney(today.amount, currency)}</span>
        </span>
      </div>
    </div>
  );
}
