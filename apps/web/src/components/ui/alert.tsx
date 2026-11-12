import { cn } from '@/lib/utils';

const VARIANTS = {
  default: 'bg-card text-card-foreground',
  destructive: 'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90',
} as const;

/** A message in the flow of the page, announced when it appears (role="alert"). */
export function Alert({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & { variant?: keyof typeof VARIANTS }) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn('relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm', VARIANTS[variant], className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-medium [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
        className,
      )}
      {...props}
    />
  );
}
