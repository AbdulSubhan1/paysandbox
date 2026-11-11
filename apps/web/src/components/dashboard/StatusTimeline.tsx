import { formatPkt } from '@/lib/format';
import type { TimelineItem } from '@/lib/dashboard/payment-detail';

const DOT: [RegExp, string][] = [
  [/succeeded|authorized|otp_verified|dispute_won/, 'bg-success'],
  [/failed|dispute_lost|otp_wrong|otp_cancelled|session_expired/, 'bg-destructive'],
  [/refund/, 'bg-muted-foreground'],
  [/dispute/, 'bg-violet'],
  [/otp/, 'bg-warning'],
];
const dotFor = (kind: string) => DOT.find(([re]) => re.test(kind))?.[1] ?? 'bg-info';

/** Vertical timeline, oldest first. */
export function StatusTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dotFor(it.kind)}`} aria-hidden />
          <div>
            <div className="text-sm font-medium">{it.message}</div>
            <div className="text-xs text-muted-foreground">{formatPkt(it.at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
