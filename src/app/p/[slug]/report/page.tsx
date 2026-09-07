import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadLedger } from '@/lib/ledger';
import { DomainError } from '@/lib/errors';
import ReportView from './report-view';

/**
 * The client report reads exactly what the List reads, under the same
 * membership check. There is no anonymous path to it — what reaches a client
 * is a PDF a member chose to send (Q4, spec 05 §5).
 */
export default async function ProjectReport({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const { slug } = await params;

  try {
    const { project, rows, fields, people } = await loadLedger(userId, slug);
    return (
      <ReportView
        projectName={project.name}
        slug={project.slug}
        rows={rows}
        fields={fields}
        people={people}
        statusFieldId={project.statusFieldId}
      />
    );
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
