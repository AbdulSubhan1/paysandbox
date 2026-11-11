'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';

/** Code tabs with a Copy button. */
export function CodeBlock({ tabs }: { tabs: { label: string; code: string }[] }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2">
        <div role="tablist" aria-label="Code examples" className="flex overflow-x-auto">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${id}-panel`}
              onClick={() => setActive(i)}
              className={`px-3 py-2 text-sm whitespace-nowrap ${i === active ? 'border-b-2 border-primary font-semibold' : 'text-muted-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(tab.code);
            toast.success('Copied');
          }}
          className="rounded px-2 py-1 text-sm font-medium hover:bg-muted"
        >
          Copy
        </button>
      </div>
      <pre id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
        <code>{tab.code}</code>
      </pre>
    </div>
  );
}
