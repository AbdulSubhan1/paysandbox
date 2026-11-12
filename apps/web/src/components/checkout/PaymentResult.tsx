'use client';

import { useEffect, useRef } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { plainDeclineMessage } from '@/lib/checkout/decline-message';

export type PayResponse = {
  status: 'succeeded' | 'requires_action' | 'failed';
  payment_id: string;
  failure?: { code: string; decline_code: string | null; message: string };
  return_url?: string;
  attempts_left?: number;
};

export function PaymentResult({
  result,
  amountLabel,
  merchantName,
  onRetry,
}: {
  result: PayResponse;
  amountLabel: string;
  merchantName: string;
  onRetry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []); // screen readers read the outcome first

  const ok = result.status === 'succeeded';
  return (
    <div className="mx-auto max-w-md pt-6 text-center">
      <div
        aria-hidden
        className={`mx-auto mb-4 grid size-14 place-items-center rounded-full text-2xl font-bold ${ok ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'}`}
      >
        {ok ? '✓' : '✕'}
      </div>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
        {ok ? 'Payment successful' : 'Payment declined'}
      </h2>
      {ok ? (
        <>
          <p className="mt-1 text-muted-foreground">
            {amountLabel} paid to {merchantName}
          </p>
          <p className="text-sm text-muted-foreground">This was a test payment. No money moved.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">{result.failure && plainDeclineMessage(result.failure)}</p>
          {result.failure && (
            <p className="mt-2 text-xs text-muted-foreground">
              For developers:{' '}
              <code className="font-mono">{[result.failure.code, result.failure.decline_code].filter(Boolean).join(' · ')}</code>
            </p>
          )}
        </>
      )}
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-background p-4 text-left text-sm">
        <dt className="text-muted-foreground">Payment</dt>
        <dd className="text-right font-mono break-all">{result.payment_id}</dd>
      </dl>
      <div className="mt-6 flex flex-col gap-2">
        {ok && result.return_url ? (
          <a href={result.return_url} className={buttonVariants({ size: 'lg' })}>
            Return to {merchantName}
          </a>
        ) : (
          <Button size="lg" onClick={onRetry}>
            Try another card
          </Button>
        )}
      </div>
    </div>
  );
}
