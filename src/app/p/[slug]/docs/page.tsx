import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadProjectDocs, loadDoc } from '@/lib/docs';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import DocsView from './docs-view';
import DocWorkspace from './doc-workspace';

export default async function ProjectDocs({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ doc?: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  try {
    const data = await loadProjectDocs(userId, (await params).slug);
    const docId = (await searchParams).doc;
    if (docId) {
      const workspace = await loadDoc(userId, docId);
      if (workspace.doc.projectId !== data.project.id) notFound();
      return <DocWorkspace {...workspace} project={data.project} canCreate={can(data.role, 'doc.create')} canEdit={can(data.role, 'doc.edit')} />;
    }
    return <DocsView project={data.project} initialDocs={data.docs} canCreate={can(data.role, 'doc.create')} />;
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
