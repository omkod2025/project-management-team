import { redirect } from 'next/navigation';
import { treeOrder } from '../wiki-tree-order';
import { loadWorkspace } from '../load-workspace';
import WikiWorkspace from '../wiki-workspace';

/** A wiki opens at its first page; with none yet, at its empty state. */
export default async function WikiHome({ params }: { params: Promise<{ wikiId: string }> }) {
  const { wikiId } = await params;
  const data = await loadWorkspace(wikiId);
  const [first] = treeOrder(data.pages);
  if (first) redirect(`/wiki/${wikiId}/${first.slug}`);
  return <WikiWorkspace {...data} />;
}
