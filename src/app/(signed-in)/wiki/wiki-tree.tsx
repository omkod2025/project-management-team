'use client';

import { useState } from 'react';
import DocIcon from '../p/[slug]/docs/doc-icon';
import WikiPageActions from './wiki-page-actions';
import WikiSearch from './wiki-search';
import { problem, wikiCall } from './wiki-api';
import { subtreeOf, treeOrder, type TreePage } from './wiki-tree-order';
import { hardNavigate } from '@/lib/hard-navigate';

type Props = {
  wiki: { id: string; title: string };
  pages: TreePage[];
  archivedPages: { id: string; title: string }[];
  currentId?: string;
  currentTitle: string;
  canWrite: boolean;
  /** An editor is open: structure stays still until it is closed. */
  locked: boolean;
  open: boolean;
};

/**
 * The wiki's left column: search, the page tree, and — for writers only —
 * New page, each page's actions, and the deleted pages with Restore.
 */
export default function WikiTree({ wiki, pages, archivedPages, currentId, currentTitle, canWrite, locked, open }: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/wiki/${wiki.id}`;
  const ordered = treeOrder(pages);
  const holdsCurrent = (id: string) => !!currentId && subtreeOf(pages, id).has(currentId);

  async function addPage(parentId: string | null) {
    setBusy(true); setError('');
    try {
      const page = await wikiCall<{ slug: string }>(`/api/wikis/${wiki.id}/pages`, 'POST', { title: 'Untitled', ...(parentId ? { parentId } : {}) });
      hardNavigate(`${base}/${page.slug}?edit=1`);
    } catch (err) { setError(problem(err, 'Could not create a page.')); setBusy(false); }
  }

  async function restore(pageId: string) {
    setBusy(true); setError('');
    try {
      const page = await wikiCall<{ slug: string }>(`/api/wikis/${wiki.id}/pages`, 'PATCH', { pageId });
      hardNavigate(`${base}/${page.slug}`);
    } catch (err) { setError(problem(err, 'Could not restore this page.')); setBusy(false); }
  }

  return <aside id="wiki-page-index" className={`doc-sidebar wiki-sidebar${open ? ' is-open' : ''}`} aria-label="Wiki pages">
    <a href={base} className="doc-name">{wiki.title}</a>
    <WikiSearch wikiId={wiki.id} />
    <nav aria-label="Pages">{ordered.map((p) => <div key={p.id}>
      <div className="doc-tree-row">
        <a href={`${base}/${p.slug}`} aria-current={p.id === currentId ? 'page' : undefined} style={{ paddingLeft: 10 + (p.depth - 1) * 16 }}>
          {p.id === currentId ? currentTitle : p.title}
        </a>
        {canWrite && <button type="button" className="wiki-tree-menu" aria-label={`Page actions for ${p.title}`} aria-expanded={menuFor === p.id}
          disabled={locked} onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}><DocIcon name="more" /></button>}
      </div>
      {canWrite && menuFor === p.id && <WikiPageActions wikiId={wiki.id} page={p} pages={pages} holdsCurrent={holdsCurrent(p.id)}
        disabled={locked || busy} onAddSubpage={(id) => void addPage(id)} onClose={() => setMenuFor(null)} />}
    </div>)}</nav>
    {!ordered.length && <p className="docs-muted">No pages yet.</p>}
    {canWrite && <div className="doc-add-actions"><button type="button" disabled={locked || busy} onClick={() => void addPage(null)}><DocIcon name="plus" />{busy ? 'Working…' : 'New page'}</button></div>}
    {error && <p role="alert" className="docs-error">{error}</p>}
    {canWrite && !!archivedPages.length && <details className="doc-archived"><summary>Deleted pages ({archivedPages.length})</summary>
      {archivedPages.map((p) => <div key={p.id}><span>{p.title}</span>
        <button type="button" disabled={busy || locked} onClick={() => void restore(p.id)}><DocIcon name="history" />Restore</button></div>)}
    </details>}
  </aside>;
}
