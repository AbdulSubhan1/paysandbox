import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { CardForm } from '@/components/checkout/CardForm';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { getDb } from '@/lib/db/client';
import { buildReturnUrl, effectiveSessionStatus, getSessionForCheckout } from '@/lib/sessions/sessions';

function Notice({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="max-w-md pt-6">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <a href={href} className="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">
        {cta}
      </a>
    </div>
  );
}

export default function CheckoutPage({ params }: PageProps<'/c/[sessionId]'>) {
  return (
    <Suspense fallback={<p className="px-4 py-14 text-center text-muted-foreground">Loading checkout…</p>}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: { params: PageProps<'/c/[sessionId]'>['params'] }) {
  await connection(); // per request: reads the database and the clock
  const { sessionId } = await params;
  const session = await getSessionForCheckout(getDb(), sessionId);
  if (!session) notFound();
  const status = effectiveSessionStatus(session, new Date());

  return (
    <div className="grid min-h-full md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="bg-background px-4 py-7 md:px-12 md:py-14">
        <a href={session.cancelUrl} className="text-sm text-muted-foreground">
          ← Back to store
        </a>
        <div className="mt-5">
          <OrderSummary merchantName={session.merchantName} lineItems={session.lineItems} amount={session.amount} currency={session.currency} />
        </div>
      </div>
      <div className="border-t border-border bg-card px-4 py-7 md:border-t-0 md:border-l md:px-12 md:py-14">
        {status === 'open' && (
          <CardForm
            sessionId={session.id}
            amount={session.amount}
            currency={session.currency}
            merchantName={session.merchantName}
            defaultEmail={session.customerEmail ?? ''}
          />
        )}
        {status === 'complete' && session.paymentId && (
          <Notice
            title="Already paid"
            body="This checkout has been paid. No second payment is possible."
            href={buildReturnUrl(session.successUrl, session.paymentId)}
            cta={`Return to ${session.merchantName}`}
          />
        )}
        {status === 'expired' && (
          <Notice
            title="This checkout has expired"
            body="Checkouts stay open for 24 hours. Go back to the store to start again."
            href={session.cancelUrl}
            cta="Back to store"
          />
        )}
      </div>
    </div>
  );
}
