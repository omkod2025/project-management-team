import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadProjectDocs, loadDoc } from '@/lib/docs';
import { listArchivedDocs } from '@/lib/doc-purge';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import DocsView from './docs-view';
import DocWorkspace from './doc-workspace';

export default async function ProjectDocs({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ doc?: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const docId = (await searchParams).doc;
  let data: Awaited<ReturnType<typeof loadProjectDocs>>;
  let workspace: Awaited<ReturnType<typeof loadDoc>> | null = null;
  try {
    data = await loadProjectDocs(userId, (await params).slug);
    if (docId) workspace = await loadDoc(userId, docId);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
  if (workspace) {
    if (workspace.doc.projectId !== data.project.id) notFound();
    return <DocWorkspace {...workspace} project={data.project} canCreate={can(data.role, 'doc.create')} canEdit={can(data.role, 'doc.edit')} />;
  }
  const canCreate = can(data.role, 'doc.create');
  // Deleted documents are an admin's to restore or remove, so only they are sent them.
  const archived = canCreate ? await listArchivedDocs(userId, data.project.id) : [];
  return <DocsView project={data.project} initialDocs={data.docs} initialArchived={archived} canCreate={canCreate} />;
}
