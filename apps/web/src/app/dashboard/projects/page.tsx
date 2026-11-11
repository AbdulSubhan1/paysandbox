import { Suspense } from 'react';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { describeKeys } from '@/lib/keys/keys';
import { listMerchants, MAX_MERCHANTS_PER_USER } from '@/lib/merchants/merchants';
import { getWebhookEndpoint } from '@/lib/webhooks/endpoints';
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
  const projects = await Promise.all(
    (await listMerchants(db, user.id)).map(async (m) => {
      const endpoint = await getWebhookEndpoint(db, m.id);
      return {
        id: m.id,
        name: m.name,
        ...(await describeKeys(db, m.id)),
        endpoint: endpoint ? { url: endpoint.url, enabled: endpoint.enabled } : null,
      };
    }),
  );
  return <ProjectsView projects={projects} canCreate={projects.length < MAX_MERCHANTS_PER_USER} max={MAX_MERCHANTS_PER_USER} />;
}
