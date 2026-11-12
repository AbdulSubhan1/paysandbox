'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { ActionResult } from './RefundForm';

export function SimulateDisputeButton({ onSimulate }: { onSimulate: () => Promise<ActionResult> }) {
  const [sending, setSending] = useState(false);
  return (
    <Button
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
        }
      }}
    >
      {sending ? 'Opening dispute…' : 'Simulate dispute'}
    </Button>
  );
}
