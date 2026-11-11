import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { isE2eMode } from '@/lib/auth/allowlist';

async function Thanks({ searchParams }: { searchParams: PageProps<'/e2e/store/thanks'>['searchParams'] }) {
  const { pay } = await searchParams;
  return (
    <p>
      Order confirmed. Payment <span data-testid="pay">{String(pay ?? '')}</span>
    </p>
  );
}

export default function E2eThanks({ searchParams }: PageProps<'/e2e/store/thanks'>) {
  if (!isE2eMode()) notFound();
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Thank you</h1>
      <Suspense fallback={null}>
        <Thanks searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
