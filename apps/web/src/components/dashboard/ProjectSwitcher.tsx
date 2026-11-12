'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import { Icon } from '@/components/ui/icon';

type Project = { id: string; name: string };

/** `/payments` from `/dashboard/<id>/payments/pay_x`: ids of one project mean nothing in another. */
function sectionOf(pathname: string, current: string): string {
  const section = pathname.split(`/dashboard/${current}`)[1]?.split('/')[1];
  return section ? `/${section}` : '';
}

function Initial({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-sm bg-primary text-[11px] font-bold text-primary-foreground">
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The current project, and a switcher when there are several. Switching stays on the same section. */
export function ProjectSwitcher({ current, projects }: { current: string; projects: Project[] }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname() ?? `/dashboard/${current}`;
  const project = projects.find((p) => p.id === current);
  if (!project) return null;
  if (projects.length === 1) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Initial name={project.name} />
        <span className="truncate">{project.name}</span>
      </span>
    );
  }
  return (
    <div className="relative flex min-w-0 items-center rounded-lg border border-input bg-white focus-within:ring-3 focus-within:ring-ring/50">
      <label htmlFor={id} className="sr-only">
        Project
      </label>
      <span className="pointer-events-none absolute left-2.5">
        <Initial name={project.name} />
      </span>
      <select
        id={id}
        value={current}
        onChange={(e) => router.push(`/dashboard/${e.target.value}${sectionOf(pathname, current)}`)}
        className="h-9 max-w-56 min-w-0 appearance-none truncate rounded-lg bg-transparent pr-8 pl-9 text-sm font-semibold outline-none"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" />
    </div>
  );
}

/** In the dashboard header: the project in the URL, if any (the projects page has none). */
export function HeaderProject({ projects }: { projects: Project[] }) {
  const { merchantId } = useParams<{ merchantId?: string }>();
  return merchantId ? <ProjectSwitcher current={merchantId} projects={projects} /> : null;
}
