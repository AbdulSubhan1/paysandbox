'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ActionResult } from './RefundForm';

export function ResendButton({ onResend }: { onResend: () => Promise<ActionResult> }) {
  const [sending, setSending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={sending}
      onClick={async () => {
        setSending(true);
        try {
          const r = await onResend();
          if (r.ok) toast.success('Resent', { description: 'Same webhook-id. The new attempt shows here in a few seconds.' });
          else toast.error(r.error);
        } catch {
          toast.error("Couldn't resend. Try again in a moment.");
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? 'Resending…' : 'Resend now'}
    </Button>
  );
}
