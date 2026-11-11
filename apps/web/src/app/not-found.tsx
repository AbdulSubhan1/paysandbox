import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/** Site-wide 404 (the checkout has its own, under /c). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <Link href="/" className="flex items-center gap-2 self-start font-bold">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">P</span>
        PaySandbox
      </Link>
      <div>
        <p className="font-mono text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          This address doesn&apos;t exist, or it moved. If you followed a checkout link, go back to the store and start
          again.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonVariants()}>
          Go to PaySandbox home
        </Link>
        <Link href="/dashboard/projects" className={buttonVariants({ variant: 'outline' })}>
          Your projects
        </Link>
      </div>
    </main>
  );
}
