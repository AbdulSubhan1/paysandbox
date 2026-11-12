import { cn } from '@/lib/utils';
import { Icon } from './icon';

/** A short wait, e.g. inside the Pay button while it processes. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span data-slot="spinner" role="status" aria-label="Loading" className="inline-flex">
      <Icon name="loader" className={cn('size-4 animate-spin', className)} />
    </span>
  );
}
