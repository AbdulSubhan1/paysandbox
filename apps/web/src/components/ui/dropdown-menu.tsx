'use client';

import Link from 'next/link';
import { cloneElement, createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Ctx = { close: () => void };
const MenuContext = createContext<Ctx>({ close: () => {} });

const ROW =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground';

/**
 * A short list of actions behind a button. Opens on click, the first item gets focus, arrow keys move, Escape or a
 * click outside closes it and focus goes back to the button.
 */
export function DropdownMenu({
  trigger,
  label,
  align = 'start',
  className,
  children,
}: {
  /** The button that opens the menu, e.g. `<Button variant="outline" />`. */
  trigger: React.ReactElement<React.ComponentProps<'button'>>;
  /** The menu's accessible name. */
  label: string;
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const triggerButton = () => root.current?.querySelector<HTMLElement>('[aria-haspopup=menu]');
  const close = () => {
    setOpen(false);
    triggerButton()?.focus();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div ref={root} className="relative inline-flex">
      {cloneElement(trigger, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          trigger.props.onClick?.(e);
          setOpen((o) => !o);
        },
      })}
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
            const i = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
            } else if (e.key === 'Tab') setOpen(false);
          }}
          className={cn(
            'absolute top-full z-50 mt-1 grid min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 motion-safe:animate-dialog-in',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          <MenuContext value={{ close }}>{children}</MenuContext>
        </div>
      )}
    </div>
  );
}

/** Runs `onSelect` after the menu has closed and focus is back on its button (so a dialog it opens returns there). */
export function DropdownMenuItem({ onSelect, danger, children }: { onSelect: () => void; danger?: boolean; children: React.ReactNode }) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={cn(ROW, danger && 'text-destructive hover:text-destructive focus-visible:text-destructive')}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuLinkItem({ href, children }: { href: string; children: React.ReactNode }) {
  const { close } = useContext(MenuContext);
  return (
    <Link href={href} role="menuitem" tabIndex={-1} className={ROW} onClick={close}>
      {children}
    </Link>
  );
}

/** Text that is not an action, e.g. who is signed in. */
export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1.5 text-xs text-muted-foreground">{children}</div>;
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />;
}
