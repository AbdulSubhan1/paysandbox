'use client';

import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { GuardResult } from '@/lib/card-guard/guard';
import { parseExpiry, validateCvc, validateEmail, validateName } from '@/lib/checkout/validate';
import type { Currency } from '@/lib/currency';
import { formatMoney } from '@/lib/money';
import { CardNumberInput, fillInput } from './CardNumberInput';
import { OtpDialog } from './OtpDialog';
import { type PayResponse, PaymentResult } from './PaymentResult';
import { TestCardPicker } from './TestCardPicker';

type FieldName = 'email' | 'card' | 'exp' | 'cvc' | 'name';
const ORDER: FieldName[] = ['email', 'card', 'exp', 'cvc', 'name'];
const IDS: Record<FieldName, string> = { email: 'email', card: 'cardnum', exp: 'exp', cvc: 'cvc', name: 'name' };
const SERVER_FIELDS: Record<string, FieldName> = { email: 'email', name: 'name', expiry: 'exp', card_number: 'card' };

const formatExpiry = (raw: string, deleting: boolean) => {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 || (d.length === 2 && !deleting) ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
};

const inputClass =
  'w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-accent aria-invalid:border-destructive';

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p id={id} className="mt-1.5 text-sm text-destructive">
      {text}
    </p>
  ) : null;
}

export function CardForm({
  sessionId,
  amount,
  currency,
  merchantName,
  defaultEmail,
}: {
  sessionId: string;
  amount: number;
  currency: Currency;
  merchantName: string;
  defaultEmail: string;
}) {
  const cardRef = useRef<HTMLInputElement>(null);
  // One id per payment attempt, kept across retries until the server gives a definite answer (no double charge).
  const attemptId = useRef<string | null>(null);
  const [guard, setGuard] = useState<GuardResult>({ state: 'empty' });
  const [email, setEmail] = useState(defaultEmail);
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ paymentId: string; error: string | null } | null>(null);
  const [result, setResult] = useState<PayResponse | null>(null);
  const amountLabel = formatMoney(amount, currency);

  const clearError = (f: FieldName) => setErrors(({ [f]: _gone, ...rest }) => rest);

  async function post(path: 'pay' | 'otp', body: object): Promise<PayResponse | { error: { code: string; message: string; field?: string } }> {
    const res = await fetch(`/c/${sessionId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  function show(r: PayResponse) {
    if (r.status === 'requires_action') setOtp({ paymentId: r.payment_id, error: null });
    else {
      setOtp(null);
      setResult(r);
    }
  }

  async function pay() {
    const now = new Date();
    const expiry = parseExpiry(exp, now);
    const found: Partial<Record<FieldName, string>> = {
      email: validateEmail(email) ?? undefined,
      card: guard.state === 'complete' ? undefined : 'Pick a test card below.',
      exp: expiry.ok ? undefined : expiry.message,
      cvc: validateCvc(cvc) ?? undefined,
      name: validateName(name) ?? undefined,
    };
    const invalid = ORDER.filter((f) => found[f]);
    setErrors(Object.fromEntries(invalid.map((f) => [f, found[f]])));
    if (invalid.length) {
      document.getElementById(IDS[invalid[0]])?.focus();
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      // The CVC was checked above and is deliberately not sent.
      attemptId.current ??= crypto.randomUUID();
      const r = await post('pay', {
        attempt_id: attemptId.current,
        email,
        name,
        card_number: cardRef.current?.value.replace(/\D/g, '') ?? '',
        expiry: exp,
      });
      attemptId.current = null; // the server answered: the next click is a new attempt
      if ('error' in r) {
        if (r.error.code === 'session_complete' || r.error.code === 'session_expired') window.location.reload();
        else if (r.error.field && SERVER_FIELDS[r.error.field]) setErrors({ [SERVER_FIELDS[r.error.field]]: r.error.message });
        else if (r.error.code === 'card_not_test_card') setErrors({ card: r.error.message });
        else setFormError(r.error.message);
      } else show(r);
    } catch {
      setFormError('Could not reach PaySandbox. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function otpStep(body: { code: string } | { cancel: true }) {
    if (!otp) return;
    setBusy(true);
    try {
      const r = await post('otp', { payment_id: otp.paymentId, ...body });
      if ('error' in r) setOtp({ ...otp, error: r.error.message });
      else if (r.status === 'requires_action') {
        setOtp({ ...otp, error: `Wrong code. ${r.attempts_left} ${r.attempts_left === 1 ? 'try' : 'tries'} left.` });
      } else show(r);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <PaymentResult
        result={result}
        amountLabel={amountLabel}
        merchantName={merchantName}
        onRetry={() => {
          setResult(null);
          setGuard({ state: 'empty' });
        }}
      />
    );
  }

  const describe = (f: FieldName) => (errors[f] ? `${IDS[f]}-err` : undefined);
  const cardLast4 = guard.state === 'complete' ? guard.card.number.slice(-4) : '';

  return (
    <div className="max-w-md">
      <h2 className="mb-5 text-lg font-semibold">Pay with card</h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void pay();
        }}
        className="flex flex-col gap-3.5"
      >
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={email}
            aria-invalid={!!errors.email}
            aria-describedby={describe('email')}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError('email');
            }}
          />
          <FieldError id="email-err" text={errors.email} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium" aria-hidden>
            Card information
          </span>
          <div className="overflow-hidden rounded-lg border border-input bg-white focus-within:border-primary">
            <CardNumberInput
              id="cardnum"
              ref={cardRef}
              errorId={describe('card')}
              onChange={(r) => {
                setGuard(r);
                clearError('card');
              }}
            />
            <div className="grid grid-cols-2 border-t border-border">
              <input
                id="exp"
                inputMode="numeric"
                maxLength={7}
                placeholder="MM / YY"
                aria-label="Expiry date, MM / YY"
                aria-invalid={!!errors.exp}
                aria-describedby={describe('exp')}
                className="bg-transparent px-3 py-2.5 text-sm outline-none aria-invalid:bg-destructive-soft"
                value={exp}
                onChange={(e) => {
                  const deleting = (e.nativeEvent as InputEvent).inputType === 'deleteContentBackward';
                  setExp(formatExpiry(e.target.value, deleting));
                  clearError('exp');
                }}
              />
              <input
                id="cvc"
                inputMode="numeric"
                maxLength={3}
                placeholder="CVC"
                autoComplete="off"
                aria-label="CVC, 3 digits"
                aria-invalid={!!errors.cvc}
                aria-describedby={describe('cvc')}
                className="border-l border-border bg-transparent px-3 py-2.5 text-sm outline-none aria-invalid:bg-destructive-soft"
                value={cvc}
                onChange={(e) => {
                  setCvc(e.target.value.replace(/\D/g, ''));
                  clearError('cvc');
                }}
              />
            </div>
          </div>
          <FieldError id="cardnum-err" text={errors.card} />
          <FieldError id="exp-err" text={errors.exp} />
          <FieldError id="cvc-err" text={errors.cvc} />
        </div>

        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Name on card
          </label>
          <input
            id="name"
            autoComplete="cc-name"
            className={inputClass}
            value={name}
            aria-invalid={!!errors.name}
            aria-describedby={describe('name')}
            onChange={(e) => {
              setName(e.target.value);
              clearError('name');
            }}
          />
          <FieldError id="name-err" text={errors.name} />
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" disabled={busy && !otp} className="mt-1 h-12 text-base">
          {busy && !otp ? (
            <>
              <Spinner /> Processing…
            </>
          ) : (
            `Pay ${amountLabel}`
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Test payment. No real money moves, real cards are refused.</p>
      </form>

      <TestCardPicker
        onPick={(number) => {
          if (!cardRef.current) return;
          fillInput(cardRef.current, number);
          cardRef.current.focus();
        }}
      />

      <OtpDialog
        open={!!otp}
        cardLast4={cardLast4}
        amountLabel={amountLabel}
        merchantName={merchantName}
        error={otp?.error}
        busy={busy}
        onVerify={(code) => void otpStep({ code })}
        onCancel={() => void otpStep({ cancel: true })}
      />
    </div>
  );
}
