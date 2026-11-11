import { Suspense } from 'react';
import { ProjectSwitcher } from '@/components/dashboard/ProjectSwitcher';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { requireProject } from '@/lib/merchants/require-project';

async function ProjectNav({ params }: { params: LayoutProps<'/dashboard/[merchantId]'>['params'] }) {
  const { merchantId } = await params;
  const { projects } = await requireProject(merchantId);
  return (
    <div className="flex flex-col gap-4">
      <ProjectSwitcher current={merchantId} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      <Sidebar merchantId={merchantId} />
    </div>
  );
}

export default function ProjectLayout({ children, params }: LayoutProps<'/dashboard/[merchantId]'>) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-52 md:shrink-0">
        <Suspense fallback={null}>
          <ProjectNav params={params} />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
