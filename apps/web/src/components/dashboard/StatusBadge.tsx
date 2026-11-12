import type { PaymentStatus } from '@/lib/payments/state';
import { cn } from '@/lib/utils';

/** Label and colour per payment status (mockup STATUS / STAT_COLOR). */
export const STATUS_META: Record<PaymentStatus, { label: string; className: string; dot: string }> = {
  succeeded: { label: 'Succeeded', className: 'bg-success-soft text-success', dot: 'bg-success' },
  partially_refunded: { label: 'Partly refunded', className: 'bg-info-soft text-info', dot: 'bg-info' },
  refunded: { label: 'Refunded', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  failed: { label: 'Declined', className: 'bg-destructive-soft text-destructive', dot: 'bg-destructive' },
  requires_action: { label: 'Waiting for OTP', className: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  disputed: { label: 'Disputed', className: 'bg-violet-soft text-violet', dot: 'bg-violet' },
  dispute_lost: { label: 'Dispute lost', className: 'bg-destructive-soft text-destructive', dot: 'bg-destructive' },
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  const m = STATUS_META[status];
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', m.className)}>{m.label}</span>;
}
