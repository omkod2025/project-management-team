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

  try {
    const { project, role, rows, holidays } = await loadLedger(userId, slug);
    return (
      <TimelineView
        projectName={project.name}
        slug={project.slug}
        rows={rows}
        holidays={holidays}
        canEdit={can(role, 'node.editDates')}
      />
    );
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
