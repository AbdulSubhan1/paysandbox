import Link from 'next/link';
import { Suspense } from 'react';
import { DeliveryBadge } from '@/components/dashboard/DeliveryBadge';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Pager } from '@/components/dashboard/Pager';
import { listEvents } from '@/lib/dashboard/events';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { getWebhookEndpoint } from '@/lib/webhooks/endpoints';
import { WebhookEndpointCard } from './WebhookEndpointCard';

type Props = PageProps<'/dashboard/[merchantId]/webhooks'>;

async function Webhooks({ params, searchParams }: Props) {
  const { merchantId } = await params;
  await requireProject(merchantId);
  const before = (await searchParams).before;
  const db = getDb();
  const [endpoint, page] = await Promise.all([
    getWebhookEndpoint(db, merchantId),
    listEvents(db, merchantId, { before: typeof before === 'string' ? before : undefined }),
  ]);
  const base = `/dashboard/${merchantId}/webhooks`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground">Signed with Standard Webhooks. Retried after 1 min, 5 min, 30 min, 2 h and 6 h.</p>
      </div>
      <section className="rounded-xl border border-border bg-card p-4">
        <WebhookEndpointCard merchantId={merchantId} endpoint={endpoint ? { url: endpoint.url, enabled: endpoint.enabled } : null} />
      </section>
      <section aria-labelledby="event-log" className="flex flex-col gap-3">
        <h2 id="event-log" className="font-semibold">
          Event log
        </h2>
        {page.rows.length === 0 ? (
          <EmptyState title="No events yet" body="Events appear when a payment succeeds or fails, a refund is made or a dispute opens or closes." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Event log">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {['Event', 'Delivery', 'Created', 'Event ID'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono">
                      <Link href={`${base}/${e.id}`} className="hover:underline">
                        {e.type}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <DeliveryBadge delivery={e.delivery} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatPkt(e.createdAt)}</td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">{e.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager next={page.next} isFirst={typeof before !== 'string'} href={(b) => (b ? `${base}?before=${b}` : base)} />
      </section>
    </div>
  );
}

export default function WebhooksPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading webhooks…</p>}>
      <Webhooks {...props} />
    </Suspense>
  );
}
