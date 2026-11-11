'use client';

import { type Ref, useId, useState, useSyncExternalStore } from 'react';
import { type GuardResult, guardCardInput, normalizeDigits } from '@/lib/card-guard/guard';

const REFUSED =
  "That isn't a PaySandbox test card. Real card numbers are refused here and cleared from the field. They are never sent, saved or logged. Pick one of the test cards below.";

const group = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');
const noop = () => () => {};

/** Sets an input's value so React's onChange fires (used by the test-card picker). */
export function fillInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The card number lives only in this DOM input, never in React state. A number that is not the start of a
 * test card is cleared after 4 digits and the refusal is announced. The field is disabled until React has
 * hydrated it, so nothing can be typed before the guard is running.
 */
export function CardNumberInput({
  id,
  onChange,
  ref,
  errorId,
}: {
  id: string;
  onChange: (result: GuardResult) => void;
  ref?: Ref<HTMLInputElement>;
  errorId?: string;
}) {
  const messageId = useId();
  const [refused, setRefused] = useState(false);
  const [brand, setBrand] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Card information
      </label>
      <input
        ref={ref}
        id={id}
        disabled={!hydrated}
        inputMode="numeric"
        autoComplete="off"
        maxLength={19}
        placeholder="Pick a test card below"
        aria-describedby={[refused ? messageId : null, errorId].filter(Boolean).join(' ') || undefined}
        className="w-full bg-transparent px-3 py-2.5 font-mono text-sm outline-none"
        onChange={(e) => {
          const result = guardCardInput(e.target.value);
          if (result.state === 'refused') {
            e.target.value = '';
            setBrand(null);
          } else {
            e.target.value = group(normalizeDigits(e.target.value));
            setBrand(result.state === 'complete' ? result.card.brand : result.state === 'partial' ? result.brand : null);
          }
          setRefused(result.state === 'refused');
          onChange(result);
        }}
      />
      {brand && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold tracking-wider text-muted-foreground">
          {brand.toUpperCase()}
        </span>
      )}
      <div aria-live="assertive">
        {refused && (
          <p id={messageId} className="mx-3 mb-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {REFUSED}
          </p>
        )}
      </div>
    </div>
  );
}
