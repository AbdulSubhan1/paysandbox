'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export function OtpDialog({
  open,
  cardLast4,
  amountLabel,
  merchantName,
  error,
  busy,
  onVerify,
  onCancel,
}: {
  open: boolean;
  cardLast4: string;
  amountLabel: string;
  merchantName: string;
  error?: string | null;
  busy?: boolean;
  onVerify: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const ready = code.length === 6 && !busy;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-[#173a6b] px-5 py-3.5 font-semibold text-white">
          <span>Sandbox Bank</span>
          <span className="text-xs font-normal opacity-80">3-D Secure · test</span>
        </div>
        <form
          className="flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onVerify(code);
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirm your payment</DialogTitle>
            <DialogDescription>
              {amountLabel} to {merchantName} with card •••• {cardLast4}. We sent a one-time code to your phone.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Test OTP: <b className="font-mono">123456</b>. Any other code fails the check.
          </p>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, ''))}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="One-time code, 6 digits"
            containerClassName="justify-center"
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!ready}>
            Verify
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel payment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
