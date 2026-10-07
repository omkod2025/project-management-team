import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadLedger, loadProjectAccess } from '@/lib/ledger';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import type { WorkKind } from '@/lib/work-kind';
import SignOut from '../../sign-out';
import ListView from './list-view';
import ListHeader from './list-header';
import ListTabLink from './list-tab-link';
import LoadingStatus from './loading-status';
import './list.css';

async function LoadedList({ userId, slug, kind }: { userId: string; slug: string; kind: WorkKind }) {
  const { project, role, rows, fields, people } = await loadLedger(userId, slug, kind);
  return <ListView
    key={`${slug}:${kind}`} kind={kind} projectId={project.id} projectName={project.name}
    slug={project.slug} rows={rows} fields={fields} people={people}
    statusFieldId={project.statusFieldId} columnOrder={project.columnOrder}
    canEdit={can(role, 'node.editValues')} isAdmin={can(role, 'field.define')}
    signOut={<SignOut className="shelf" />}
  />;
}

export default async function ListPage({ params, kind }: {
  params: Promise<{ slug: string }>; kind: WorkKind;
}) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const { slug } = await params;
  try {
    // Resolve the small, authorized header first; stream the ledger below it.
    const { project, role } = await loadProjectAccess(userId, slug);
    const fallback = <div className="book">
      <nav className="rail" aria-label="Modules" />
      <div className="sheet">
        <ListHeader projectId={project.id} projectName={project.name} slug={slug}
          isAdmin={can(role, 'field.define')} kind={kind} signOut={<SignOut className="shelf" />} />
        <nav className="list-kind-tabs label" aria-label="List type">
          <ListTabLink href={`/p/${slug}`} active={kind === 'task'} label="Task" />
          <ListTabLink href={`/p/${slug}/defects`} active={kind === 'defect'} label="Defect" />
        </nav>
        <div className="toolbar label"><input className="search" type="search" placeholder="Search  /" disabled aria-label={kind === 'defect' ? 'Search defects' : 'Search tasks'} /></div>
        <div className="pagebody">
          <div className="scroller" aria-busy="true">
            <div className="table-loading"><LoadingStatus label={`กำลังโหลด ${kind === 'defect' ? 'Defect' : 'Task'}…`} /></div>
          </div>
        </div>
      </div>
    </div>;
    return <Suspense key={`${slug}:${kind}`} fallback={fallback}>
      <LoadedList userId={userId} slug={slug} kind={kind} />
    </Suspense>;
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
