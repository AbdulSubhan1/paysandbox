'use client';

import { useId, useState } from 'react';
import { toast } from '@/components/ui/toast';
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
} from './actions';

export type EndpointSummary = { url: string; enabled: boolean } | null;

/** One webhook endpoint per project: URL, signing secret (reveal, copy, roll), re-enable and test events. */
export function WebhookEndpointCard(props: { merchantId: string; endpoint: EndpointSummary }) {
  // Local state starts from the props; remount when the server's view changes (e.g. auto-disabled after failures).
  return <EndpointCard key={`${props.endpoint?.url ?? ''}|${props.endpoint?.enabled ?? ''}`} {...props} />;
}

function EndpointCard({ merchantId, endpoint }: { merchantId: string; endpoint: EndpointSummary }) {
  const ids = { url: useId(), secret: useId(), type: useId() };
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [saved, setSaved] = useState(!!endpoint);
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [type, setType] = useState<string>(TEST_EVENT_TYPES[0]);
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
                try {
                  const r = await reenableWebhookEndpointAction(merchantId);
                  if (r.ok) {
                    setEnabled(true);
                    toast.success('Endpoint re-enabled');
                  } else toast.error(r.error);
                } catch {
                  toast.error("Couldn't re-enable the endpoint. Try again in a moment.");
                }
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
          try {
            const r = await saveWebhookEndpointAction(merchantId, url);
            setError(r.ok ? null : r.error);
            if (r.ok) {
              setUrl(r.url);
              setSaved(true);
              setEnabled(true);
              toast.success('Endpoint saved');
            } else toast.error(r.error);
          } catch {
            toast.error("Couldn't save the endpoint. Try again in a moment.");
          } finally {
            setSaving(false);
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
                      toast.success('Signing secret copied');
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
                    try {
                      const r = await revealWebhookSecretAction(merchantId);
                      if (r.ok) setSecret(r.secret);
                      else toast.error(r.error);
                    } catch {
                      toast.error("Couldn't load the signing secret. Try again in a moment.");
                    }
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
                      try {
                        const r = await rollWebhookSecretAction(merchantId);
                        if (r.ok) {
                          setSecret(r.secret);
                          setCopied(false);
                          toast.success('Signing secret rolled', { description: 'The old secret keeps working for 24 hours.' });
                        } else toast.error(r.error);
                      } catch {
                        toast.error("Couldn't roll the signing secret. Try again in a moment.");
                      } finally {
                        setRollOpen(false);
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
                try {
                  const r = await sendTestEventAction(merchantId, type);
                  if (r.ok) toast.success(`Sent ${type}`, { description: 'It arrives at your endpoint in a few seconds.' });
                  else {
                    toast.error(r.error);
                    if (r.error.includes('50 test events')) setCapReached(true);
                  }
                } catch {
                  toast.error("Couldn't send the test event. Try again in a moment.");
                }
              }}
            >
              Send test event
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
