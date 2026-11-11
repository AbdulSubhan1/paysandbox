'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatPkt } from '@/lib/format';
import type { Currency } from '@/lib/currency';
import { formatMoney } from '@/lib/money';
import type { ActionResult } from './RefundForm';

/** Solid red with white text: the soft destructive variant is under 4.5:1 contrast on tinted panels. */
export const SOLID_DANGER = 'bg-destructive text-white hover:bg-destructive/90';

const REASON_TEXT: Record<string, string> = {
  product_not_received: 'The customer says the product never arrived.',
  fraudulent: 'The cardholder says they did not make this payment.',
};

/** An open dispute: win (payment goes back) or lose (dispute_lost), losing behind a confirm. */
export function DisputePanel({
  dispute,
  onClose,
}: {
  dispute: { amount: number; currency: Currency; reason: string; respondBy: Date };
  onClose: (outcome: 'won' | 'lost') => Promise<ActionResult>;
}) {
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const close = async (outcome: 'won' | 'lost') => {
    setSending(true);
    try {
      const r = await onClose(outcome);
      if (r.ok) toast.success(outcome === 'won' ? 'Dispute won' : 'Dispute lost', { description: 'A dispute.closed webhook is on its way.' });
      else toast.error(r.error);
    } catch {
      toast.error("Couldn't close the dispute. Try again in a moment.");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet/40 bg-violet-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Dispute: needs your response</h2>
        <span className="text-sm text-violet">Respond by {formatPkt(dispute.respondBy)}</span>
      </div>
      <p className="text-sm">
        {REASON_TEXT[dispute.reason] ?? `Reason: ${dispute.reason}.`} {formatMoney(dispute.amount, dispute.currency)} is on hold. In a real gateway you would
        upload proof; here you pick the outcome. If you don&apos;t answer by the date above, the dispute is lost automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={sending} onClick={() => close('won')}>
          Submit evidence and win
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger render={<Button className={SOLID_DANGER} disabled={sending} />}>Accept and lose</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accept the dispute and lose {formatMoney(dispute.amount, dispute.currency)}?</AlertDialogTitle>
              <AlertDialogDescription>The payment becomes “Dispute lost” and the money stays with the customer. This can&apos;t be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => close('lost')}>Accept and lose</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
