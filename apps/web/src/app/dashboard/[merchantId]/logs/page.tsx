import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Pager } from '@/components/dashboard/Pager';
import { listApiRequests } from '@/lib/dashboard/request-log';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { cn } from '@/lib/utils';

type Props = PageProps<'/dashboard/[merchantId]/logs'>;

const statusClass = (s: number) => (s >= 500 ? 'text-destructive' : s >= 400 ? 'text-warning' : 'text-success');

async function Logs({ params, searchParams }: Props) {
  const { merchantId } = await params;
  await requireProject(merchantId);
  const sp = await searchParams;
  const failedOnly = sp.failed === '1';
  const before = typeof sp.before === 'string' ? sp.before : undefined;
  const page = await listApiRequests(getDb(), merchantId, { before, failedOnly });
  const base = `/dashboard/${merchantId}/logs`;
  const href = (b: string | null) => {
    const q = new URLSearchParams();
    if (failedOnly) q.set('failed', '1');
    if (b) q.set('before', b);
    return q.size ? `${base}?${q}` : base;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">API request log</h1>
        <p className="text-muted-foreground">Every call to the API with your secret key, newest first.</p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Filter">
        {[
          [false, 'All requests'],
          [true, 'Failed only'],
        ].map(([f, label]) => (
          <Link
            key={String(label)}
            href={f ? `${base}?failed=1` : base}
            aria-current={failedOnly === f ? 'true' : undefined}
            className={cn('rounded-full border px-3 py-1 text-sm', failedOnly === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
          >
            {label}
          </Link>
        ))}
      </div>
      {page.rows.length === 0 ? (
        <EmptyState title="No requests yet" body="Requests show up here as soon as your server calls the API." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="API requests">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {['Time', 'Method', 'Path', 'Status', 'Idempotency key', 'Error', 'Duration'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {page.rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-sans whitespace-nowrap text-muted-foreground">{formatPkt(r.createdAt)}</td>
                  <td className="px-4 py-2">{r.method}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.path}</td>
                  <td className={cn('px-4 py-2 font-semibold', statusClass(r.status))}>{r.status}</td>
                  <td className="px-4 py-2">{r.idempotencyKey ?? '—'}</td>
                  <td className="px-4 py-2">{r.errorCode ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{r.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager next={page.next} isFirst={!before} href={href} />
      <p className="text-xs text-muted-foreground">Request and response bodies are never stored.</p>
    </div>
  );
}

export default function LogsPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading requests…</p>}>
      <Logs {...props} />
    </Suspense>
  );
}
