import { notFound, redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadPageBySlug } from '@/lib/docs';
import { DomainError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { pageSections } from '@/lib/doc-rules';
import DocContent from '../doc-content';
import DocWorkspace from '../doc-workspace';

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ slug: string; pageSlug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');
  const { slug, pageSlug } = await params;
  try {
    const data = await loadPageBySlug(userId, slug, pageSlug);
    return <DocWorkspace {...data} initialEditing={(await searchParams).edit === '1'} canCreate={can(data.role, 'doc.create')} canEdit={can(data.role, 'doc.edit')}>
      {pageSections(data.page.template).map(([key, label]) => <section key={key} className="doc-section">
        {data.page.template === 'module' && <h2>{label}</h2>}
        {data.page.content[key] ? <DocContent value={data.page.content[key]} />
          : <p className="docs-muted">Nothing written yet.</p>}
      </section>)}
    </DocWorkspace>;
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') notFound();
    throw err;
  }
}
