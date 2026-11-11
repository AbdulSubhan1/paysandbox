'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { type RevealedSecret, SecretKeyDialog } from '@/components/dashboard/SecretKey';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { createProjectAction } from './actions';

type Project = { id: string; name: string };

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
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{p.name}</CardTitle>
            <Link href={`/dashboard/${p.id}`} className={buttonVariants({ size: 'sm' })}>
              Open dashboard
            </Link>
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
