import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadLedger } from '@/lib/ledger';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import TimelineView from './timeline-view';

export default async function ProjectTimeline({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const { slug } = await params;

  let ledger: Awaited<ReturnType<typeof loadLedger>>;
  try {
    ledger = await loadLedger(userId, slug);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
  const { project, role, rows, holidays, fields, people } = ledger;
  return (
    <TimelineView
      projectId={project.id}
      projectName={project.name}
      slug={project.slug}
      rows={rows}
      holidays={holidays}
      fields={fields}
      people={people}
      statusFieldId={project.statusFieldId}
      canEdit={can(role, 'node.editDates')}
      isAdmin={can(role, 'field.define')}
    />
  );
}
