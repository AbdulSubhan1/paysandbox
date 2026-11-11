import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-8">
        <Link href="/dashboard/projects" className="flex items-center gap-2 font-bold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">P</span>
          PaySandbox
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-warning-soft px-3 py-1 font-semibold text-warning">Test mode · live mode not available</span>
          <span className="text-muted-foreground">@{user.githubLogin}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
