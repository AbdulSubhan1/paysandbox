import Link from 'next/link';
import { Suspense } from 'react';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import { HeaderProject } from '@/components/dashboard/ProjectSwitcher';
import { Toaster } from '@/components/ui/toast';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { listMerchants } from '@/lib/merchants/merchants';

function TestModePill() {
  return (
    <span
      className="shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-warning"
      title="Live mode does not exist. PaySandbox never moves real money."
    >
      Test mode
    </span>
  );
}

/** Project, test-mode pill and account menu. The project comes from the URL, so the switcher reads it client-side. */
async function HeaderRest() {
  const user = await requireUser();
  const projects = await listMerchants(getDb(), user.id);
  return (
    <>
      <HeaderProject projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      <TestModePill />
      <span className="flex-1" />
      <AccountMenu name={user.name || user.githubLogin} login={user.githubLogin} />
    </>
  );
}

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="flex min-h-15 items-center gap-3 px-4 py-2.5 md:gap-4 md:px-6">
          <Link href="/dashboard/projects" aria-label="PaySandbox, your projects" className="flex shrink-0 items-center gap-2 font-bold">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">P</span>
            <span className="hidden sm:inline">PaySandbox</span>
          </Link>
          <Suspense fallback={<TestModePill />}>
            <HeaderRest />
          </Suspense>
        </div>
      </header>
      {children}
      <Toaster />
    </div>
  );
}
