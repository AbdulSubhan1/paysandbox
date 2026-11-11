'use client';

import { useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { TEST_EVENT_TYPES } from '@/lib/webhooks/test-event-types';
import {
  reenableWebhookEndpointAction,
  revealWebhookSecretAction,
  rollWebhookSecretAction,
  saveWebhookEndpointAction,
  sendTestEventAction,
} from './webhook-actions';

export type EndpointSummary = { url: string; enabled: boolean } | null;

/** One webhook endpoint per project: URL, signing secret (reveal, copy, roll), re-enable and test events. */
export function WebhookEndpointCard({ merchantId, endpoint }: { merchantId: string; endpoint: EndpointSummary }) {
  const ids = { url: useId(), secret: useId(), type: useId() };
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [saved, setSaved] = useState(!!endpoint);
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [type, setType] = useState<string>(TEST_EVENT_TYPES[0]);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [capReached, setCapReached] = useState(false);
  const [rollOpen, setRollOpen] = useState(false); // AlertDialogAction is a plain button: close the dialog ourselves

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Webhooks</h3>

      {saved && !enabled && (
        <Alert variant="destructive">
          <AlertTitle>Disabled after 20 failed events in a row</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            Fix your endpoint, then turn it back on. Events from while it was off are not resent.
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if ((await reenableWebhookEndpointAction(merchantId)).ok) setEnabled(true);
              }}
            >
              Re-enable
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const r = await saveWebhookEndpointAction(merchantId, url);
          setSaving(false);
          setError(r.ok ? null : r.error);
          if (r.ok) {
            setUrl(r.url);
            setSaved(true);
            setEnabled(true);
          }
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={ids.url}>Webhook endpoint URL</FieldLabel>
          <Input
            id={ids.url}
            type="url"
            inputMode="url"
            placeholder="https://your-app.com/api/webhooks/paysandbox"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={!!error}
            required
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save endpoint'}
        </Button>
      </form>

      {saved && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id={`${ids.secret}-label`}>
              Signing secret
            </span>
            {secret ? (
              <InputGroup>
                <InputGroupInput readOnly value={secret} className="font-mono text-sm" aria-label="Signing secret" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={async () => {
                      await navigator.clipboard.writeText(secret);
                      setCopied(true);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">whsec_••••••••</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const r = await revealWebhookSecretAction(merchantId);
                    if (r.ok) setSecret(r.secret);
                  }}
                >
                  Reveal
                </Button>
              </div>
            )}
            <AlertDialog open={rollOpen} onOpenChange={setRollOpen}>
              <AlertDialogTrigger render={<Button variant="outline" size="sm" className="self-start" />}>Roll signing secret</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Roll the signing secret?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Webhooks get a new secret now. For 24 hours every webhook carries signatures for both secrets, so your
                    receiver keeps working while you update it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      const r = await rollWebhookSecretAction(merchantId);
                      setRollOpen(false);
                      if (r.ok) {
                        setSecret(r.secret);
                        setCopied(false);
                      }
                    }}
                  >
                    Roll signing secret
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor={ids.type}>Test event type</FieldLabel>
              <select
                id={ids.type}
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm"
              >
                {TEST_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="outline"
              disabled={capReached || !enabled}
              onClick={async () => {
                const r = await sendTestEventAction(merchantId, type);
                setTestMsg(r.ok ? { ok: true, text: `Sent ${type}. It arrives at your endpoint in a few seconds.` } : { ok: false, text: r.error });
                if (!r.ok && r.error.includes('50 test events')) setCapReached(true);
              }}
            >
              Send test event
            </Button>
          </div>
          {testMsg && (
            <p role="status" className={testMsg.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
              {testMsg.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
