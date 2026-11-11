import { notFound, redirect } from 'next/navigation';
import { isE2eMode } from '@/lib/auth/allowlist';
import { getDb } from '@/lib/db/client';
import { appUrl, createCheckoutSession } from '@/lib/sessions/sessions';
import { E2E } from '@/test/seed-e2e';

/** A fake merchant store used only by the E2E suite (404 everywhere else). */
async function checkout() {
  'use server';
  if (!isE2eMode()) notFound();
  const now = new Date();
  const session = await createCheckoutSession(
    { db: getDb(), merchantId: E2E.merchantA.id, now, requestId: 'req_e2e', idempotencyKey: null, currency: 'pkr' },
    {
      amount: 510000,
      currency: 'pkr',
      lineItems: [
        { name: 'Developer hoodie', quantity: 1, amount: 450000 },
        { name: 'Sticker pack', quantity: 2, amount: 30000 },
      ],
      successUrl: `${appUrl()}/e2e/store/thanks`,
      cancelUrl: `${appUrl()}/e2e/store`,
      customerEmail: null,
    },
  );
  redirect(`/c/${session.id}`);
}

export default function E2eStore() {
  if (!isE2eMode()) notFound();
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Your cart</h1>
      <form action={checkout} className="mt-6">
        <button type="submit" className="rounded-lg bg-[#7a4b2a] px-5 py-3 font-semibold text-white">
          Checkout · PKR 5,100.00
        </button>
      </form>
    </main>
  );
}
