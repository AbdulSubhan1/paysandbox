'use client';

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
