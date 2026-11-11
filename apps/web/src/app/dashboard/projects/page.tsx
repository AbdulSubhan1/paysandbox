import { Suspense } from 'react';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { listMerchants, MAX_MERCHANTS_PER_USER, projectsWithCheckouts } from '@/lib/merchants/merchants';
import { ProjectsView } from './ProjectsView';

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading projects…</p>}>
      <Projects />
    </Suspense>
  );
}

async function Projects() {
  const user = await requireUser();
  const db = getDb();
  const merchants = await listMerchants(db, user.id);
  const locked = await projectsWithCheckouts(db, merchants.map((m) => m.id));
  const projects = merchants.map((m) => ({ id: m.id, name: m.name, currency: m.currency, currencyLocked: locked.has(m.id) }));
  return <ProjectsView projects={projects} canCreate={projects.length < MAX_MERCHANTS_PER_USER} max={MAX_MERCHANTS_PER_USER} />;
}
