'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type DashboardSection = 'overview' | 'payments' | 'customers' | 'disputes' | 'test-cards' | 'developers' | 'webhooks' | 'logs';

const MAIN: [DashboardSection, string][] = [
  ['overview', 'Overview'],
  ['payments', 'Payments'],
  ['customers', 'Customers'],
  ['disputes', 'Disputes'],
  ['test-cards', 'Test cards'],
];
const DEVELOPERS: [DashboardSection, string][] = [
  ['developers', 'API keys & code'],
  ['webhooks', 'Webhooks'],
  ['logs', 'API request log'],
];

const href = (merchantId: string, s: DashboardSection) => (s === 'overview' ? `/dashboard/${merchantId}` : `/dashboard/${merchantId}/${s}`);

export function sectionFromPath(pathname: string | null, merchantId: string): DashboardSection {
  const rest = (pathname ?? '').split(`/dashboard/${merchantId}`)[1]?.split('/')[1];
  return ([...MAIN, ...DEVELOPERS].find(([s]) => s === rest)?.[0] ?? 'overview') as DashboardSection;
}

/** Phones: the links wrap above the content (no sideways scroll). md+: the mockup's sidebar. */
export function Sidebar({ merchantId, current, openDisputes = 0 }: { merchantId: string; current?: DashboardSection; openDisputes?: number }) {
  const pathname = usePathname();
  const active = current ?? sectionFromPath(pathname, merchantId);
  const item = ([s, label]: [DashboardSection, string]) => (
    <Link
      key={s}
      href={href(merchantId, s)}
      aria-current={s === active ? 'page' : undefined}
      className={cn(
        'flex min-h-9 items-center justify-between gap-2 rounded-md px-3 text-sm whitespace-nowrap hover:bg-muted hover:text-foreground',
        s === active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {s === 'disputes' && openDisputes > 0 && (
        <span className="rounded-full bg-destructive px-1.5 text-xs font-bold text-white tabular-nums">
          {openDisputes}
          <span className="sr-only"> open</span>
        </span>
      )}
    </Link>
  );
  return (
    <nav aria-label="Project" className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
      {MAIN.map(item)}
      <span className="self-center px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:mt-4 md:mb-1 md:self-start">
        Developers
      </span>
      {DEVELOPERS.map(item)}
    </nav>
  );
}
