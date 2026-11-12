'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';

export type RevealedSecret = { ok: true; merchantName: string; secretKey: string } | { ok: false; error: string };

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput readOnly value={value} className="font-mono text-sm" aria-label={label} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

/** The secret key, shown once after create or roll. */
export function SecretKeyDialog({ revealed, onClose }: { revealed: RevealedSecret | null; onClose: () => void }) {
  return (
    <Dialog open={!!revealed?.ok} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your secret key</DialogTitle>
          <DialogDescription>Copy it now. For safety it is shown only once; after you close this, only its last 4 characters are visible.</DialogDescription>
        </DialogHeader>
        {revealed?.ok && <CopyField label={`Secret key for ${revealed.merchantName}`} value={revealed.secretKey} />}
        <DialogFooter>
          <Button onClick={onClose}>I&apos;ve copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Publishable key, masked secret key and "Roll secret key" (AlertDialogAction is a plain button, so we close it). */
export function KeysPanel({
  projectName,
  publishableKey,
  secretLast4,
  onRoll,
}: {
  projectName: string;
  publishableKey: string | null;
  secretLast4: string | null;
  onRoll: () => Promise<RevealedSecret>;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {publishableKey && <CopyField label="Publishable key" value={publishableKey} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Secret key</div>
          <div className="font-mono text-sm text-muted-foreground">sk_test_…{secretLast4}</div>
        </div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Roll secret key</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Roll the secret key for {projectName}?</AlertDialogTitle>
              <AlertDialogDescription>You get a new secret key now. The current one keeps working for 24 hours, then stops.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const r = await onRoll();
                    if (r.ok) setRevealed(r);
                    else toast.error(r.error);
                  } catch {
                    toast.error("Couldn't roll the key. Try again in a moment.");
                  } finally {
                    setOpen(false);
                  }
                }}
              >
                Roll key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <SecretKeyDialog revealed={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}
