import Link from 'next/link';

export function StatCard({ label, value, caption, href, dot }: { label: string; value: string; caption: string; href: string; dot: string }) {
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 hover:border-primary">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </Link>
  );
}
