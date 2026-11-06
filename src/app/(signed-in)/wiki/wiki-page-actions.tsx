'use client';

import { useState } from 'react';
import DocIcon from '../p/[slug]/docs/doc-icon';
import ConfirmDelete, { TrashIcon } from '../confirm-delete';
import { problem, wikiCall } from './wiki-api';
import { moveTargets, type TreePage } from './wiki-tree-order';
import { hardNavigate } from '@/lib/hard-navigate';

type Props = {
  wikiId: string;
  page: TreePage;
  pages: TreePage[];
  /** The page being read contains this one, or is it — deleting it leaves nothing to show. */
  holdsCurrent: boolean;
  disabled: boolean;
  /** A subpage of this page is being created, from this menu. */
  addingSubpage?: boolean;
  onAddSubpage: (parentId: string) => void;
  onClose: () => void;
};

/**
 * The per-page menu a writer opens from the tree: a subpage, Move to…, and
 * Delete. Inline under the row rather than a floating panel, so it never
 * covers the tree it acts on — except the delete question, which is the one
 * delete dialog every surface shares. Underneath, Delete archives: the page
 * waits under Deleted pages for a Restore.
 */
export default function WikiPageActions({ wikiId, page, pages, holdsCurrent, disabled, addingSubpage = false, onAddSubpage, onClose }: Props) {
  const [mode, setMode] = useState<'menu' | 'move' | 'delete'>('menu');
  const [parentId, setParentId] = useState(page.parentId ?? '');
  const [position, setPosition] = useState<'first' | 'last'>('last');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const targets = moveTargets(pages, page.id);
  const hasChildren = pages.some((p) => p.parentId === page.id);

  async function move(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parent = parentId || null;
    const first = pages.find((p) => p.parentId === parent && p.id !== page.id);
    setBusy(true); setError('');
    try {
      await wikiCall(`/api/wiki-pages/${page.id}`, 'POST', {
        action: 'move', parentId: parent, ...(position === 'first' && first ? { beforeId: first.id } : {}),
      });
      window.location.reload();
    } catch (err) { setError(problem(err, 'Could not move this page.')); setBusy(false); }
  }

  async function remove() {
    try {
      await wikiCall(`/api/wiki-pages/${page.id}`, 'POST', { action: 'archive' });
    } catch (err) { throw new Error(problem(err, 'Could not delete this page.')); }
    if (holdsCurrent) hardNavigate(`/wiki/${wikiId}`); else window.location.reload();
  }

  return <div className="wiki-page-actions" role="group" aria-label={`Actions for ${page.title}`}>
    {mode !== 'move' && <>
      {page.depth < 3 && <button type="button" disabled={disabled} aria-busy={addingSubpage} onClick={() => onAddSubpage(page.id)}><DocIcon name="plus" />New subpage</button>}
      <button type="button" disabled={disabled} onClick={() => setMode('move')}><DocIcon name="move" />Move to…</button>
      <button type="button" className="delete-control" disabled={disabled} onClick={() => setMode('delete')}><TrashIcon />Delete…</button>
    </>}
    {mode === 'move' && <form onSubmit={(e) => void move(e)}>
      <label>Parent page<select value={parentId} disabled={busy} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Top level</option>
        {targets.map((p) => <option key={p.id} value={p.id}>{'— '.repeat(p.depth - 1)}{p.title}</option>)}
      </select></label>
      <label>Position<select value={position} disabled={busy} onChange={(e) => setPosition(e.target.value as 'first' | 'last')}>
        <option value="first">First</option><option value="last">Last</option>
      </select></label>
      <div className="docs-actions"><button className="docs-primary" disabled={busy || disabled} aria-busy={busy}>{busy ? 'Moving…' : 'Move page'}</button></div>
    </form>}
    {mode === 'delete' && <ConfirmDelete title="Delete page" name={page.title}
      note="Writers can restore it from Deleted pages." onConfirm={remove} onCancel={() => setMode('menu')}>
      {hasChildren && <p>Its subpages are deleted with it.</p>}
    </ConfirmDelete>}
    <button type="button" className="wiki-quiet" disabled={busy} onClick={mode === 'move' ? () => setMode('menu') : onClose}><DocIcon name="close" />{mode === 'move' ? 'Back' : 'Close'}</button>
    {error && <p role="alert" className="docs-error">{error}</p>}
  </div>;
}
