'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { parsePkrInput } from '@/lib/format';
import { formatPkr } from '@/lib/money';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REASONS: [string, string][] = [
  ['requested_by_customer', 'Requested by customer'],
  ['duplicate', 'Duplicate'],
  ['fraudulent', 'Fraudulent'],
];

type Props = { amountLeft: number; onRefund: (amountText: string, reason: string) => Promise<ActionResult> };

/** Full or partial refund. Amount starts at what is left (and resets when that changes); the server parses it again. */
export function RefundForm(props: Props) {
  return <Form key={props.amountLeft} {...props} />;
}

function Form({ amountLeft, onRefund }: Props) {
  const ids = { amount: useId(), reason: useId() };
  const max = formatPkr(amountLeft);
  const [amount, setAmount] = useState(max.replace(/^PKR /, ''));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false); // a second click before React re-renders must not send twice

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy.current) return;
        const parsed = parsePkrInput(amount);
        if (!parsed.ok) return setError(parsed.message);
        if (parsed.paisa > amountLeft) return setError(`At most ${max} is left to refund.`);
        if (!reason) return setError('Choose a reason.');
        setError(null);
        busy.current = true;
        setSending(true);
        try {
          const r = await onRefund(amount, reason);
          if (r.ok) toast.success(`Refunded ${formatPkr(parsed.paisa)}`, { description: 'A refund.created webhook is on its way.' });
          else {
            setError(r.error);
            toast.error(r.error);
          }
        } catch {
          toast.error("Couldn't refund. Try again in a moment.");
        } finally {
          busy.current = false;
          setSending(false);
        }
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor={ids.amount}>Amount (max {max})</FieldLabel>
          <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error} />
        </Field>
        <Field className="flex-1">
          <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
          <select
            id={ids.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
          >
            <option value="">Choose a reason</option>
            {REASONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={sending}>
          {sending ? 'Refunding…' : 'Refund'}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <p className="text-xs text-muted-foreground">Enter less than the full amount for a partial refund. Sends a refund.created webhook.</p>
    </form>
  );
}
