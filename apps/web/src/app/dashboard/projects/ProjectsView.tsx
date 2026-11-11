'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { type RevealedSecret, SecretKeyDialog } from '@/components/dashboard/SecretKey';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CURRENCIES, CURRENCY_INFO, type Currency } from '@/lib/currency';
import { changeProjectCurrencyAction, createProjectAction } from './actions';

type Project = { id: string; name: string; currency: Currency; currencyLocked: boolean };

const selectClass = 'h-8 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm';
const currencyLabel = (c: Currency) => `${CURRENCY_INFO[c].code} · ${CURRENCY_INFO[c].name}`;

/** The project list and "New project". Keys, webhooks and payments live in each project's dashboard. */
export function ProjectsView({ projects, canCreate, max }: { projects: Project[]; canCreate: boolean; max: number }) {
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const [createState, createAction, creating] = useActionState(async (prev: RevealedSecret | null, form: FormData) => {
    const result = await createProjectAction(prev, form);
    if (result.ok) setRevealed(result);
    return result;
  }, null);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-muted-foreground">Each project has its own test keys, webhooks and payments. Up to {max} projects.</p>
      </div>

      {projects.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{p.name}</CardTitle>
            <div className="flex items-center gap-3">
              <ProjectCurrency project={p} />
              <Link href={`/dashboard/${p.id}`} className={buttonVariants({ size: 'sm' })}>
                Open dashboard
              </Link>
            </div>
          </CardHeader>
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
              <Field className="md:w-56">
                <FieldLabel htmlFor="currency">Currency</FieldLabel>
                <select id="currency" name="currency" defaultValue="pkr" className={selectClass}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {currencyLabel(c)}
                    </option>
                  ))}
                </select>
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

      <SecretKeyDialog revealed={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

/** The project's currency: changeable until its first checkout, then shown as locked. */
function ProjectCurrency({ project }: { project: Project }) {
  const [saving, startSaving] = useTransition();
  if (project.currencyLocked) {
    return (
      <span className="text-sm text-muted-foreground" title="A project's currency can't change after its first checkout">
        {CURRENCY_INFO[project.currency].code} (locked)
      </span>
    );
  }
  return (
    <select
      aria-label={`Currency of ${project.name}`}
      defaultValue={project.currency}
      disabled={saving}
      className={selectClass}
      onChange={(e) => {
        const currency = e.target.value as Currency;
        startSaving(async () => {
          const r = await changeProjectCurrencyAction(project.id, currency);
          if (r.ok) toast.success(`${project.name} now charges in ${CURRENCY_INFO[currency].code}`);
          else toast.error(r.error);
        });
      }}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {CURRENCY_INFO[c].code}
        </option>
      ))}
    </select>
  );
}
