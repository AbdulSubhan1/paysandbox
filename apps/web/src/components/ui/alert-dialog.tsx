'use client';

import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button';
import { DialogClose, DialogDescription, DialogTrigger, Dialog as Root, ModalDialog, useDialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** A confirm step before something that is hard to undo. Same open state API as Dialog. */
export const AlertDialog = Root;
export const AlertDialogTrigger = DialogTrigger;

/** role="alertdialog"; a backdrop click does not close it (Escape and Cancel do). */
export function AlertDialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ModalDialog role="alertdialog" dismissOnBackdrop={false} className={cn('group/alert-dialog-content max-w-xs grid-cols-[minmax(0,1fr)] gap-4 rounded-xl p-4 open:grid sm:max-w-sm', className)}>
      {children}
    </ModalDialog>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-header" className={cn('grid place-items-center gap-1.5 text-center sm:place-items-start sm:text-left', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  const { titleId } = useDialog();
  return <h2 id={titleId} data-slot="alert-dialog-title" className={cn('font-heading text-base font-medium', className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <DialogDescription className={cn('text-balance md:text-pretty', className)} {...props} />;
}

/** The confirm button. It does not close the dialog by itself: the caller closes it when the work is done. */
export function AlertDialogAction(props: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />;
}

export function AlertDialogCancel({
  variant = 'outline',
  size = 'default',
  className,
  children,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return <DialogClose data-slot="alert-dialog-cancel" render={<Button variant={variant} size={size} className={className} />}>{children}</DialogClose>;
}
