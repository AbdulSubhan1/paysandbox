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

/** "Showing 26–50 of 312" with Previous / Next; a missing cursor greys its link out. */
export function PositionPager({
  from,
  count,
  total,
  prevHref,
  nextHref,
}: {
  from: number;
  count: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const link = (href: string | null, label: string) =>
    href ? (
      <Link href={href} className={buttonVariants({ variant: 'outline' })}>
        {label}
      </Link>
    ) : (
      <span aria-disabled="true" className={buttonVariants({ variant: 'outline', className: 'pointer-events-none opacity-50' })}>
        {label}
      </span>
    );
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">{total === 0 ? 'No payments' : `Showing ${from}–${from + count - 1} of ${total}`}</span>
      {(prevHref || nextHref) && (
        <span className="flex gap-2">
          {link(prevHref, 'Previous')}
          {link(nextHref, 'Next')}
        </span>
      )}
    </nav>
  );
}
