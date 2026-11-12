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

/** Mobile: one scrolling row above the content. md+: the mockup's sidebar. */
export function Sidebar({ merchantId, current }: { merchantId: string; current?: DashboardSection }) {
  const pathname = usePathname();
  const active = current ?? sectionFromPath(pathname, merchantId);
  const item = ([s, label]: [DashboardSection, string]) => (
    <Link
      key={s}
      href={href(merchantId, s)}
      aria-current={s === active ? 'page' : undefined}
      className={cn(
        'shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-muted hover:text-foreground',
        s === active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Project" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {MAIN.map(item)}
      <span className="shrink-0 self-center px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:mt-4 md:self-start">
        Developers
      </span>
      {DEVELOPERS.map(item)}
    </nav>
  );
}
