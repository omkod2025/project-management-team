'use client';

import { useState } from 'react';
import DocIcon from '../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from './wiki-api';
import { moveTargets, type TreePage } from './wiki-tree-order';

type Props = {
  wikiId: string;
  page: TreePage;
  pages: TreePage[];
  /** The page being read contains this one, or is it — archiving it leaves nothing to show. */
  holdsCurrent: boolean;
  disabled: boolean;
  onAddSubpage: (parentId: string) => void;
  onClose: () => void;
};

/**
 * The per-page menu a writer opens from the tree: a subpage, Move to…, and
 * Archive. Inline under the row rather than a floating panel, so it never
 * covers the tree it acts on.
 */
export default function WikiPageActions({ wikiId, page, pages, holdsCurrent, disabled, onAddSubpage, onClose }: Props) {
  const [mode, setMode] = useState<'menu' | 'move' | 'archive'>('menu');
  const [parentId, setParentId] = useState(page.parentId ?? '');
  const [position, setPosition] = useState<'first' | 'last'>('last');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const targets = moveTargets(pages, page.id);
  const hasChildren = pages.some((p) => p.parentId === page.id);

  async function move(e: React.FormEvent) {
    e.preventDefault();
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

  async function archive() {
    setBusy(true); setError('');
    try {
      await wikiCall(`/api/wiki-pages/${page.id}`, 'POST', { action: 'archive' });
      if (holdsCurrent) window.location.assign(`/wiki/${wikiId}`); else window.location.reload();
    } catch (err) { setError(problem(err, 'Could not archive this page.')); setBusy(false); }
  }

  return <div className="wiki-page-actions" role="group" aria-label={`Actions for ${page.title}`}>
    {mode === 'menu' && <>
      {page.depth < 3 && <button type="button" disabled={disabled} onClick={() => onAddSubpage(page.id)}><DocIcon name="plus" />New subpage</button>}
      <button type="button" disabled={disabled} onClick={() => setMode('move')}><DocIcon name="move" />Move to…</button>
      <button type="button" disabled={disabled} onClick={() => setMode('archive')}><DocIcon name="archive" />Archive</button>
    </>}
    {mode === 'move' && <form onSubmit={(e) => void move(e)}>
      <label>Parent page<select value={parentId} disabled={busy} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Top level</option>
        {targets.map((p) => <option key={p.id} value={p.id}>{'— '.repeat(p.depth - 1)}{p.title}</option>)}
      </select></label>
      <label>Position<select value={position} disabled={busy} onChange={(e) => setPosition(e.target.value as 'first' | 'last')}>
        <option value="first">First</option><option value="last">Last</option>
      </select></label>
      <div className="docs-actions"><button className="docs-primary" disabled={busy || disabled}>{busy ? 'Moving…' : 'Move page'}</button></div>
    </form>}
    {mode === 'archive' && <>
      <p><strong>Archive “{page.title}”?</strong>{hasChildren ? ' Its subpages are archived with it.' : ''} Writers can restore it from Archived pages.</p>
      <div className="docs-actions"><button type="button" className="docs-primary" disabled={busy || disabled} onClick={() => void archive()}>{busy ? 'Archiving…' : 'Archive page'}</button></div>
    </>}
    <button type="button" className="wiki-quiet" disabled={busy} onClick={mode === 'menu' ? onClose : () => setMode('menu')}><DocIcon name="close" />{mode === 'menu' ? 'Close' : 'Back'}</button>
    {error && <p role="alert" className="docs-error">{error}</p>}
  </div>;
}
