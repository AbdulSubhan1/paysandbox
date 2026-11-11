'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Toasts in the dashboard's colours (globals.css tokens). Not `richColors`: its green-on-green text fails WCAG contrast. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
