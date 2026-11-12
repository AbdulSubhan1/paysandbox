'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** An input with something attached, e.g. a read-only key and its Copy button. */
export function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[aria-invalid=true]]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function InputGroupAddon({ className, align = 'inline-start', ...props }: React.ComponentProps<'div'> & { align?: 'inline-start' | 'inline-end' }) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none',
        align === 'inline-start' ? 'order-first pl-2 has-[>button]:ml-[-0.3rem]' : 'order-last pr-2 has-[>button]:mr-[-0.3rem]',
        className,
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

export function InputGroupButton({ className, ...props }: Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return <Button variant="ghost" size="in-group" className={cn('shadow-none', className)} {...props} />;
}

export function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input-group-control"
      className={cn('h-full w-full min-w-0 flex-1 bg-transparent px-2.5 py-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}
