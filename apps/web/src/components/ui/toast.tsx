'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

type Tone = 'success' | 'error';
type Toast = { id: number; tone: Tone; title: string; description?: string };

// A tiny store outside React, so `toast.success(...)` works from any handler without a provider.
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const NONE: Toast[] = [];
let nextId = 1;

function set(next: Toast[]) {
  toasts = next;
  listeners.forEach((l) => l());
}

function dismiss(id: number) {
  set(toasts.filter((t) => t.id !== id));
}

function add(tone: Tone, title: string, opts?: { description?: string }) {
  const id = nextId++;
  set([...toasts.slice(-2), { id, tone, title, description: opts?.description }]); // at most 3 on screen
  setTimeout(() => dismiss(id), 5000);
}

/** `toast.success('Endpoint saved')`, `toast.error(message)`, with an optional `{ description }`. */
export const toast = {
  success: (title: string, opts?: { description?: string }) => add('success', title, opts),
  error: (title: string, opts?: { description?: string }) => add('error', title, opts),
};

const TONE: Record<Tone, { icon: 'check' | 'alert'; className: string }> = {
  success: { icon: 'check', className: 'bg-success-soft text-success' },
  error: { icon: 'alert', className: 'bg-destructive-soft text-destructive' },
};

/** Renders the toasts, bottom right, in a polite live region. Mount once per layout that shows toasts. */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => NONE,
  );
  return (
    <section aria-label="Notifications" data-toaster className="pointer-events-none fixed right-4 bottom-4 z-[60] w-80 max-w-[calc(100vw-2rem)]">
      <ol aria-live="polite" className="grid gap-2">
        {list.map((t) => (
          <li
            key={t.id}
            data-toast
            className="pointer-events-auto flex motion-safe:animate-toast-in items-start gap-3 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
          >
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', TONE[t.tone].className)}>
              <Icon name={TONE[t.tone].icon} className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={() => dismiss(t.id)} className="rounded text-muted-foreground hover:text-foreground">
              <Icon name="close" className="size-3.5" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
