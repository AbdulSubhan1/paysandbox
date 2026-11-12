'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';
import { CURRENCY_INFO, type Currency } from '@/lib/currency';
import { parseAmountInput } from '@/lib/format';
import { formatMoney } from '@/lib/money';

export type ActionResult = { ok: true } | { ok: false; error: string };

const REASONS: [string, string][] = [
  ['requested_by_customer', 'Requested by customer'],
  ['duplicate', 'Duplicate'],
  ['fraudulent', 'Fraudulent'],
];

type Props = {
  currency: Currency;
  amountLeft: number;
  onRefund: (amountText: string, reason: string) => Promise<ActionResult>;
  /** After a successful refund, e.g. close the dialog. */
  onDone?: () => void;
  onCancel?: () => void;
};

/**
 * Full or partial refund. The amount starts empty, so nothing is refunded by an accidental click; "Full …" fills
 * in what is left. The server parses the amount again.
 */
export function RefundForm({ currency, amountLeft, onRefund, onDone, onCancel }: Props) {
  const ids = { amount: useId(), reason: useId(), error: useId() };
  const max = formatMoney(amountLeft, currency);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false); // a second click before React re-renders must not send twice

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy.current) return;
        const parsed = parseAmountInput(amount, currency);
        if (!parsed.ok) return setError(parsed.message);
        if (parsed.amount > amountLeft) return setError(`At most ${max} is left to refund.`);
        if (!reason) return setError('Choose a reason.');
        setError(null);
        busy.current = true;
        setSending(true);
        try {
          const r = await onRefund(amount, reason);
          if (r.ok) {
            toast.success(`Refunded ${formatMoney(parsed.amount, currency)}`, { description: 'A refund.created webhook is on its way.' });
            onDone?.();
          } else {
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
      <Field>
        <FieldLabel htmlFor={ids.amount}>Amount</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex h-10 min-w-0 items-center rounded-lg border sm:flex-1 border-input bg-white focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive">
            <span className="pl-3 text-sm text-muted-foreground">{CURRENCY_INFO[currency].code}</span>
            <input
              id={ids.amount}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? ids.error : undefined}
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-base tabular-nums outline-none md:text-sm"
            />
          </div>
          <Button variant="outline" size="field" onClick={() => setAmount(max.replace(/^[A-Z]{3} /, ''))}>
            Full {max}
          </Button>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
        <select
          id={ids.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-white px-2.5 text-base md:text-sm"
        >
          <option value="">Choose a reason</option>
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {error && <FieldError id={ids.error}>{error}</FieldError>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="field" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="field" disabled={sending}>
          {sending ? 'Refunding…' : 'Refund'}
        </Button>
      </div>
    </form>
  );
}

/** The payment page's secondary "Refund" button and the dialog it opens. */
export function RefundDialog(props: Omit<Props, 'onDone' | 'onCancel'>) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="field" />}>Refund</DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Refund this payment</DialogTitle>
          <DialogDescription>
            Up to {formatMoney(props.amountLeft, props.currency)} left to refund. Less than that is a partial refund. Sends a refund.created webhook.
          </DialogDescription>
        </DialogHeader>
        <RefundForm {...props} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
