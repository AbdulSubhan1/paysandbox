'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/components/ui/toast';
import type { ActionResult } from './RefundForm';

/** The payment page's "More" menu. "Simulate dispute" asks first: it puts the payment's money on hold. */
export function PaymentMoreMenu({ onSimulate }: { onSimulate: () => Promise<ActionResult> }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  return (
    <>
      <DropdownMenu
        label="More actions"
        align="end"
        trigger={
          <Button variant="outline" size="field" aria-label="More actions">
            More
            <Icon name="chevronDown" />
          </Button>
        }
      >
        <DropdownMenuItem danger onSelect={() => setConfirmOpen(true)}>
          Simulate dispute
        </DropdownMenuItem>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Simulate a dispute?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer&apos;s bank challenges this payment and what is left of it goes on hold. A dispute.created webhook is sent, and you then win or lose it here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  const r = await onSimulate();
                  if (r.ok) toast.success('Dispute opened', { description: 'A dispute.created webhook is on its way.' });
                  else toast.error(r.error);
                } catch {
                  toast.error("Couldn't open a dispute. Try again in a moment.");
                } finally {
                  setSending(false);
                  setConfirmOpen(false);
                }
              }}
            >
              {sending ? 'Opening dispute…' : 'Simulate dispute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
