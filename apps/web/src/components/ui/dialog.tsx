'use client';

import { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type Ctx = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasDescription: boolean;
  setHasDescription: (has: boolean) => void;
};

const DialogContext = createContext<Ctx | null>(null);

export function useDialog(): Ctx {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('Dialog parts must be inside <Dialog> or <AlertDialog>.');
  return ctx;
}

type RootProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode };

/** Open state for a dialog: controlled with `open` + `onOpenChange`, or on its own. */
export function Dialog({ open: controlled, defaultOpen = false, onOpenChange, children }: RootProps) {
  const [own, setOwn] = useState(defaultOpen);
  const [hasDescription, setHasDescription] = useState(false);
  const open = controlled ?? own;
  const ids = { titleId: useId(), descriptionId: useId() };
  // Escape can arrive twice (keydown, then the browser's cancel event): tell the owner only once
  const current = useRef(open);
  useEffect(() => {
    current.current = open;
  }, [open]);
  const setOpen = (next: boolean) => {
    if (current.current === next) return;
    current.current = next;
    if (controlled === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  return <DialogContext value={{ open, setOpen, ...ids, hasDescription, setHasDescription }}>{children}</DialogContext>;
}

type SlotProps = React.ComponentProps<'button'> & {
  /** The element to use, e.g. `<Button variant="outline" />`; its own children are kept if none are given here. */
  render?: React.ReactElement<React.ComponentProps<'button'>>;
};

/** Clones `render` (or a plain button) with an onClick that runs `action` after the element's own handler. */
function Slot({ render, children, onClick, action, ...props }: SlotProps & { action: () => void }) {
  const element = isValidElement(render) ? render : <button type="button" />;
  return cloneElement(element, {
    ...props,
    children: children ?? element.props.children,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      element.props.onClick?.(e);
      onClick?.(e);
      if (!e.defaultPrevented) action();
    },
  });
}

export function DialogTrigger(props: SlotProps) {
  const { setOpen } = useDialog();
  return <Slot aria-haspopup="dialog" {...props} action={() => setOpen(true)} />;
}

export function DialogClose(props: SlotProps) {
  const { setOpen } = useDialog();
  return <Slot {...props} action={() => setOpen(false)} />;
}

/**
 * The native <dialog>, opened with showModal(): the page behind is inert, focus stays inside, Escape closes, and
 * focus goes back to what had it before. Children mount only while open, so autoFocus and fresh state just work.
 */
export function ModalDialog({
  role,
  dismissOnBackdrop,
  className,
  children,
}: {
  role?: 'alertdialog';
  dismissOnBackdrop: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const { open, setOpen, titleId, descriptionId, hasDescription } = useDialog();
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', ''); // jsdom has no showModal
      // showModal focuses the first control; do the same where it doesn't (or where autoFocus ran too early)
      if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-modal={role ? true : undefined}
      aria-labelledby={titleId}
      aria-describedby={hasDescription ? descriptionId : undefined}
      // Escape: close through our state (the browser's own close would leave `open` out of sync)
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setOpen(false);
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        setOpen(false);
      }}
      onClick={(e) => {
        if (!dismissOnBackdrop || e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) setOpen(false); // a click on the backdrop, not on the dialog's own padding
      }}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto border-0 bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none backdrop:bg-black/10 backdrop:backdrop-blur-xs open:motion-safe:animate-dialog-in',
        className,
      )}
    >
      {open && children}
    </dialog>
  );
}

const WIDTHS = { sm: 'max-w-[calc(100%-2rem)] sm:max-w-sm', md: 'max-w-[calc(100%-2rem)] sm:max-w-md' } as const;

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  flush = false,
  size = 'sm',
}: {
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  /** No padding or gap: the content lays itself out edge to edge. */
  flush?: boolean;
  size?: keyof typeof WIDTHS;
}) {
  return (
    <ModalDialog dismissOnBackdrop className={cn('relative grid-cols-[minmax(0,1fr)] rounded-xl open:grid', flush ? 'gap-0 overflow-hidden p-0' : 'gap-4 p-4', WIDTHS[size], className)}>
      {children}
      {showCloseButton && (
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}>
          <Icon name="close" />
          <span className="sr-only">Close</span>
        </DialogClose>
      )}
    </ModalDialog>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  const { titleId } = useDialog();
  return <h2 id={titleId} data-slot="dialog-title" className={cn('font-heading text-base leading-none font-medium', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { descriptionId, setHasDescription } = useDialog();
  useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return (
    <p
      id={descriptionId}
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground', className)}
      {...props}
    />
  );
}
