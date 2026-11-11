import type { EventListRow } from '@/lib/dashboard/overview';
import { cn } from '@/lib/utils';

export function DeliveryBadge({ delivery }: { delivery: EventListRow['delivery'] }) {
  const [label, cls] = !delivery
    ? ['Not sent', 'bg-muted text-muted-foreground']
    : delivery.state === 'delivered'
      ? ['Delivered', 'bg-success-soft text-success']
      : delivery.state === 'failed'
        ? ['Failed', 'bg-destructive-soft text-destructive']
        : delivery.attemptCount > 0
          ? ['Retrying', 'bg-warning-soft text-warning']
          : ['Sending', 'bg-info-soft text-info'];
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', cls)}>{label}</span>;
}
