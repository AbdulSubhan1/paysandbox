import Link from 'next/link';
import { Suspense } from 'react';
import { Toaster } from '@/components/ui/toast';
import { requireUser } from '@/lib/auth/session';

async function SignedInAs() {
  const user = await requireUser();
  return <span className="text-muted-foreground">@{user.githubLogin}</span>;
}

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-8">
        <Link href="/dashboard/projects" className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">P</span>
          PaySandbox
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span
            className="rounded-full bg-warning-soft px-3 py-1 font-semibold text-warning"
            title="Live mode does not exist. PaySandbox never moves real money."
          >
            Test mode · live mode not available
          </span>
          <Suspense fallback={null}>
            <SignedInAs />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      <Toaster />
    </div>
  );
}
