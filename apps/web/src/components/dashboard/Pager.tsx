import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/** "Newest" back to page 1 and "Older" to the next page (keyset paging has no page numbers). */
export function Pager({ next, href, isFirst }: { next: string | null; href: (before: string | null) => string; isFirst: boolean }) {
  if (!next && isFirst) return null;
  return (
    <nav aria-label="Pages" className="flex gap-2">
      {!isFirst && (
        <Link href={href(null)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Newest
        </Link>
      )}
      {next && (
        <Link href={href(next)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Older
        </Link>
      )}
    </nav>
  );
}
