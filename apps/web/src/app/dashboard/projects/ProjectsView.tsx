'use client';

import { useActionState, useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { createProjectAction, type RevealedSecret, rollSecretKeyAction } from './actions';
import { type EndpointSummary, WebhookEndpointCard } from './WebhookEndpointCard';

type Project = { id: string; name: string; publishableKey: string | null; secretLast4: string | null; endpoint: EndpointSummary };

function CopyField({ label, value }: { label: string; value: string }) {
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

export function ProjectsView({ projects, canCreate, max }: { projects: Project[]; canCreate: boolean; max: number }) {
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const [createState, createAction, creating] = useActionState(async (prev: RevealedSecret | null, form: FormData) => {
    const result = await createProjectAction(prev, form);
    if (result.ok) setRevealed(result);
    return result;
  }, null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-muted-foreground">Each project has its own test keys. Up to {max} projects.</p>
      </div>

      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {p.publishableKey && <CopyField label="Publishable key" value={p.publishableKey} />}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Secret key</div>
                <div className="font-mono text-sm text-muted-foreground">sk_test_…{p.secretLast4}</div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Roll secret key</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Roll the secret key for {p.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You get a new secret key now. The current one keeps working for 24 hours, then stops.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => setRevealed(await rollSecretKeyAction(p.id))}>Roll key</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <WebhookEndpointCard merchantId={p.id} endpoint={p.endpoint} />
          </CardContent>
        </Card>
      ))}

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAction} className="flex flex-col gap-3 md:flex-row md:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor="name">Project name</FieldLabel>
                <Input id="name" name="name" placeholder="Chai Code Co." required minLength={2} maxLength={40} />
                {createState && !createState.ok && <FieldError>{createState.error}</FieldError>}
              </Field>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create project'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">You have reached {max} projects.</p>
      )}

      <Dialog open={!!revealed?.ok} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your secret key</DialogTitle>
            <DialogDescription>
              Copy it now. For safety it is shown only once; after you close this, only its last 4 characters are visible.
            </DialogDescription>
          </DialogHeader>
          {revealed?.ok && <CopyField label={`Secret key for ${revealed.merchantName}`} value={revealed.secretKey} />}
          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>I&apos;ve copied it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
