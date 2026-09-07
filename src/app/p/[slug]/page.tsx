import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadLedger } from '@/lib/ledger';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import ListView from './list-view';

export default async function ProjectList({ params }: { params: Promise<{ slug: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const { slug } = await params;

  try {
    const { project, role, rows, fields, people } = await loadLedger(userId, slug);
    return (
      <ListView
        projectId={project.id}
        projectName={project.name}
        slug={project.slug}
        rows={rows}
        fields={fields}
        people={people}
        statusFieldId={project.statusFieldId}
        canEdit={can(role, 'node.editValues')}
        isAdmin={can(role, 'field.define')}
      />
    );
  } catch (err) {
    // A project the user cannot see is indistinguishable from one that does
    // not exist — that is the point of the 404 (spec 05 §2).
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
