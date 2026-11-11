import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action && (
        <Link href={action.href} className={buttonVariants({ size: 'sm' })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
