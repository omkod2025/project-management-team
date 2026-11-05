import { loadWorkspace } from '../../load-workspace';
import WikiWorkspace from '../../wiki-workspace';

/** One wiki page; `?edit=1` opens it in the editor for someone who may write. */
export default async function WikiPageView({ params, searchParams }: { params: Promise<{ wikiId: string; pageSlug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const [{ wikiId, pageSlug }, query] = await Promise.all([params, searchParams]);
  const data = await loadWorkspace(wikiId, pageSlug);
  return <WikiWorkspace {...data} initialEditing={query.edit === '1'} />;
}
