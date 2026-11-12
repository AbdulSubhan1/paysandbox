import { Suspense } from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { countOpenDisputes } from '@/lib/dashboard/disputes';
import { getDb } from '@/lib/db/client';
import { requireProject } from '@/lib/merchants/require-project';

async function ProjectNav({ params }: { params: LayoutProps<'/dashboard/[merchantId]'>['params'] }) {
  const { merchantId } = await params;
  await requireProject(merchantId);
  return <Sidebar merchantId={merchantId} openDisputes={await countOpenDisputes(getDb(), merchantId)} />;
}

/** The project's sidebar beside the page; the project itself is in the header (dashboard/layout.tsx). */
export default function ProjectLayout({ children, params }: LayoutProps<'/dashboard/[merchantId]'>) {
  return (
    <div className="flex flex-col md:flex-row">
      <aside className="border-b border-border px-3 py-3 md:w-56 md:shrink-0 md:border-b-0 md:py-6">
        <Suspense fallback={null}>
          <ProjectNav params={params} />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:pb-12">
        <div className="max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
