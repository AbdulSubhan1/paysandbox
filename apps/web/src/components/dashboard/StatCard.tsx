import Link from 'next/link';

/** A money tile on the overview: label, big amount, a line of context. Opens the matching payments list. */
export function StatCard({ label, value, caption, href }: { label: string; value: string; caption: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 hover:border-primary md:p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums md:text-3xl">{value}</span>
      <span className="text-sm text-muted-foreground">{caption}</span>
    </Link>
  );
}
