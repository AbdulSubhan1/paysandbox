import { cn } from '@/lib/utils';

/** A label, its control, and an optional description and error, stacked. */
export function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn('group/field flex w-full flex-col gap-2 *:w-full data-[invalid=true]:text-destructive [&>.sr-only]:w-auto', className)}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="field-label" className={cn('flex w-fit items-center gap-2 text-sm leading-snug font-medium select-none', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="field-description" className={cn('text-left text-sm leading-normal font-normal text-muted-foreground', className)} {...props} />;
}

/** Announced when it appears. Renders nothing without children. */
export function FieldError({ className, children, ...props }: React.ComponentProps<'div'>) {
  if (!children) return null;
  return (
    <div role="alert" data-slot="field-error" className={cn('text-sm font-normal text-destructive', className)} {...props}>
      {children}
    </div>
  );
}
