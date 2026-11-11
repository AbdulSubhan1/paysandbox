'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';

/** `/payments` from `/dashboard/<id>/payments/pay_x`: ids of one project mean nothing in another. */
function sectionOf(pathname: string, current: string): string {
  const section = pathname.split(`/dashboard/${current}`)[1]?.split('/')[1];
  return section ? `/${section}` : '';
}

/** Switches project and stays on the same section. */
export function ProjectSwitcher({ current, projects }: { current: string; projects: { id: string; name: string }[] }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname() ?? `/dashboard/${current}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Project
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => router.push(`/dashboard/${e.target.value}${sectionOf(pathname, current)}`)}
        className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-sm font-semibold"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
