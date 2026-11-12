'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarRail,
} from '@/components/ui/sidebar';
import DocIcon from '../p/[slug]/docs/doc-icon';
import PurgePage from '../p/[slug]/docs/purge-page';
import { ancestorIds, DocRowActions, FoldAll, PageTree } from '../p/[slug]/docs/doc-page-tree';
import ConfirmDelete from '../confirm-delete';
import WikiSearch from './wiki-search';
import { problem, wikiCall } from './wiki-api';
import { subtreeOf, type TreePage } from './wiki-tree-order';
import { hardNavigate } from '@/lib/hard-navigate';

type Props = {
  wiki: { id: string; title: string };
  pages: TreePage[];
  archivedPages: { id: string; title: string; parentId: string | null }[];
  currentId?: string;
  currentTitle: string;
  canWrite: boolean;
  /** Owner and install admin: Delete permanently beside Restore (D-82). */
  canDelete: boolean;
  /** An editor is open: structure stays still until it is closed. */
  locked: boolean;
};

/**
 * The wiki's left column, drawn with the shadcn Sidebar exactly as Docs is:
 * search on top, the page tree nested level by level with a chevron to fold
 * each branch, and — for writers only — an add-subpage and a delete icon on
 * each row (delete archives; Restore brings it back), New page and the
 * deleted pages with Restore; the owner and the install admin may also delete
 * one of those for good. It hides with the trigger, the rail or Ctrl+\, and is
 * a drawer on a phone.
 */
export default function WikiTree({ wiki, pages, archivedPages, currentId, currentTitle, canWrite, canDelete, locked }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [removing, setRemoving] = useState<TreePage | null>(null);
  // What is in flight — 'new', 'sub:<parent id>' or 'restore:<page id>' — so only its button reads busy.
  const [working, setWorking] = useState<string | null>(null);
  const busy = working !== null || refreshing;
  const [error, setError] = useState('');
  // Subpages start folded; only the open page's ancestors are unfolded, so it is never buried.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorIds(pages, currentId)));
  const [seenId, setSeenId] = useState(currentId);
  if (currentId !== seenId) {
    setSeenId(currentId);
    setExpanded((old) => new Set([...old, ...ancestorIds(pages, currentId)]));
  }
  const base = `/wiki/${wiki.id}`;
  const parents = [...new Set(pages.flatMap((p) => p.parentId ?? []))];
  const allOpen = parents.length > 0 && parents.every((id) => expanded.has(id));

  function toggle(id: string) {
    setExpanded((old) => {
      const next = new Set(old);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function addPage(parentId: string | null) {
    if (busy) return;
    setWorking(parentId ? `sub:${parentId}` : 'new'); setError('');
    try {
      const page = await wikiCall<{ slug: string }>(`/api/wikis/${wiki.id}/pages`, 'POST', { title: 'Untitled', ...(parentId ? { parentId } : {}) });
      hardNavigate(`${base}/${page.slug}?edit=1`);
    } catch (err) { setError(problem(err, 'Could not create a page.')); setWorking(null); }
  }

  async function remove(page: TreePage) {
    try {
      await wikiCall(`/api/wiki-pages/${page.id}`, 'POST', { action: 'archive' });
    } catch (err) { throw new Error(problem(err, 'Could not delete this page.')); }
    // Deleting the page being read, or one above it, leaves nothing here to show.
    if (currentId && subtreeOf(pages, page.id).has(currentId)) hardNavigate(base); else window.location.reload();
  }

  async function restore(pageId: string) {
    if (busy) return;
    setWorking(`restore:${pageId}`); setError('');
    try {
      const page = await wikiCall<{ slug: string }>(`/api/wikis/${wiki.id}/pages`, 'PATCH', { pageId });
      hardNavigate(`${base}/${page.slug}`);
    } catch (err) { setError(problem(err, 'Could not restore this page.')); setWorking(null); }
  }

  return <Sidebar>
    <aside id="wiki-page-index" className="doc-pages docs-book wiki-book wiki-pages" aria-label="Wiki pages">
      <SidebarHeader className="doc-pages-head">
        <a href={base} className="doc-name">{wiki.title}</a>
        <WikiSearch wikiId={wiki.id} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="doc-pages-group">
          <div className="doc-pages-label"><SidebarGroupLabel>Pages</SidebarGroupLabel>
            {parents.length > 0 && <FoldAll allOpen={allOpen} onClick={() => setExpanded(allOpen ? new Set() : new Set(parents))} />}</div>
          <nav aria-label="Pages">
            <PageTree pages={pages} currentId={currentId} currentTitle={currentTitle} base={base} expanded={expanded} onToggle={toggle}
              actions={(p) => <DocRowActions page={p} canCreate={canWrite} editing={locked} busy={busy}
                onAddSubpage={(q) => void addPage(q.id)} onRemove={(q) => { setRemoving(q); setError(''); }} />} />
          </nav>
          {!pages.length && <p className="docs-muted doc-pages-empty">No pages yet.</p>}
        </SidebarGroup>
      </SidebarContent>
      {removing && <ConfirmDelete title="Delete page" name={removing.title}
        note="Writers can restore it from Deleted pages." onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)}>
        {pages.some((p) => p.parentId === removing.id) && <p>Its subpages are deleted with it.</p>}
      </ConfirmDelete>}
      {(canWrite || error) && <SidebarFooter className="doc-pages-foot">
        {canWrite && <div className="doc-add-actions"><button type="button" disabled={locked || busy} aria-busy={working === 'new'} onClick={() => void addPage(null)}><DocIcon name="plus" />{busy ? 'Working…' : 'New page'}</button></div>}
        {error && <p role="alert" className="docs-error">{error}</p>}
        {canWrite && !!archivedPages.length && <details className="doc-archived"><summary>Deleted pages ({archivedPages.length})</summary>
          {archivedPages.map((p) => <div key={p.id} className="doc-archived-row"><span>{p.title}</span><span className="doc-archived-actions">
            <button type="button" disabled={busy || locked} aria-busy={working === `restore:${p.id}`} onClick={() => void restore(p.id)}
              aria-label={`Restore page ${p.title}`}><DocIcon name="history" />Restore</button>
            {canDelete && <PurgePage endpoint={`/api/wikis/${wiki.id}/pages`} page={p} archived={archivedPages} disabled={busy || locked}
              onDone={() => startRefresh(() => router.refresh())} />}
          </span></div>)}
        </details>}
      </SidebarFooter>}
    </aside>
    <SidebarRail />
  </Sidebar>;
}
