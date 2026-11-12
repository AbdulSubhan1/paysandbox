'use client';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

/** A monospace ID you can click to copy. */
export function IdText({ value }: { value: string }) {
  return (
    <button
      type="button"
      title="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast.success('Copied', { description: value });
      }}
      className="rounded font-mono text-sm text-muted-foreground hover:text-foreground"
    >
      {value}
    </button>
  );
}

/** A long ID shortened to fit, with a visible Copy button (the full ID is in its title and accessible name). */
export function CopyId({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span title={value} className="min-w-0 truncate font-mono text-xs">
        {value}
      </span>
      <Button
        variant="outline"
        size="xs"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success('Copied', { description: value });
        }}
      >
        Copy
      </Button>
    </span>
  );
}
