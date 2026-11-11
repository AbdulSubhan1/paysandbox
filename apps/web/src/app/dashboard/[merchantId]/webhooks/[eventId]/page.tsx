import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DeliveryAttempts } from '@/components/dashboard/DeliveryAttempts';
import { DeliveryBadge } from '@/components/dashboard/DeliveryBadge';
import { IdText } from '@/components/dashboard/IdText';
import { ResendButton } from '@/components/dashboard/ResendButton';
import { getEventDetail } from '@/lib/dashboard/events';
import { getDb } from '@/lib/db/client';
import { formatPkt } from '@/lib/format';
import { requireProject } from '@/lib/merchants/require-project';
import { resendEventAction } from '../actions';

type Props = PageProps<'/dashboard/[merchantId]/webhooks/[eventId]'>;

async function EventDetail({ params }: Props) {
  const { merchantId, eventId } = await params;
  await requireProject(merchantId);
  const d = await getEventDetail(getDb(), merchantId, eventId);
  if (!d) notFound();
  const { event, delivery } = d;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/${merchantId}/webhooks`} className="text-sm text-muted-foreground hover:underline">
        ← Webhooks
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">{event.type}</h1>
            <DeliveryBadge delivery={delivery ? { state: delivery.state, attemptCount: delivery.attemptCount, nextAttemptAt: delivery.nextAttemptAt } : null} />
          </div>
          <IdText value={event.id} />
          <p className="text-sm text-muted-foreground">
            Created {formatPkt(event.createdAt)}
            {delivery?.state === 'pending' && delivery.nextAttemptAt && delivery.attemptCount > 0 ? ` · next attempt ${formatPkt(delivery.nextAttemptAt)}` : ''}
          </p>
        </div>
        {delivery && <ResendButton onResend={resendEventAction.bind(null, merchantId, event.id)} />}
      </div>
      <section aria-labelledby="request" className="flex flex-col gap-2">
        <h2 id="request" className="font-semibold">
          Request we sent
        </h2>
        <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-xs">{JSON.stringify(JSON.parse(d.body), null, 2)}</pre>
      </section>
      <section aria-labelledby="attempts" className="flex flex-col gap-2">
        <h2 id="attempts" className="font-semibold">
          Delivery attempts
        </h2>
        {!delivery ? (
          <p className="text-sm text-muted-foreground">Not sent: there was no enabled webhook endpoint when this event happened.</p>
        ) : d.attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sending now…</p>
        ) : (
          <DeliveryAttempts attempts={d.attempts} />
        )}
      </section>
    </div>
  );
}

export default function EventPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading event…</p>}>
      <EventDetail {...props} />
    </Suspense>
  );
}
