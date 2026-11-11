'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';

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
        onChange={(e) => router.push(pathname.replace(`/dashboard/${current}`, `/dashboard/${e.target.value}`))}
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
