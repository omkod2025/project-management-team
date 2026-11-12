'use client';

import { useRef, useState } from 'react';
import DocIcon from '../../../p/[slug]/docs/doc-icon';
import { TrashIcon } from '../../../confirm-delete';
import { problem, wikiCall } from '../../wiki-api';
import { hardNavigate } from '@/lib/hard-navigate';

const THAI = /[฀-๿]/;

/**
 * Deleting a wiki, for good (D-82). Drawn for the owner and the install
 * admin — the route refuses everyone else, and this is never offered to
 * someone it would refuse.
 *
 * A modal, deliberately: nothing here can be undone, so it needs both the
 * interruption and the protected focus. The delete button stays disabled
 * until the wiki's title is typed back exactly, which no stray Return can do.
 *
 * The same dialog opens from Settings → Archive and from the trash button on
 * the wiki's row in the Wiki list (`compact`).
 */
export function DeleteWikiButton({ wiki, compact = false }: { wiki: { id: string; title: string }; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed.trim() === wiki.title.trim();

  function open() {
    setTyped(''); setError('');
    dialog.current?.showModal();
    confirmInput.current?.focus();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
    trigger.current?.focus();
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !matches) return;
    setBusy(true); setError('');
    try {
      await wikiCall(`/api/wikis/${wiki.id}`, 'DELETE');
      hardNavigate('/wiki');
    } catch (err) { setError(problem(err, 'The wiki was not deleted. Reload and try again.')); setBusy(false); }
  }

  const head = `delete-wiki-head-${wiki.id}`;
  return <>
    {compact
      ? <button ref={trigger} type="button" className="docs-delete" aria-haspopup="dialog"
          aria-label={`Delete wiki ${wiki.title}`} title="Delete wiki" onClick={open}><TrashIcon /></button>
      : <button ref={trigger} type="button" className="wiki-danger" aria-haspopup="dialog" onClick={open}>
          <DocIcon name="trash" />Delete wiki…
        </button>}
    <dialog ref={dialog} className="wiki-dialog" aria-labelledby={head}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form className="wiki-dialog-sheet" onSubmit={(e) => void remove(e)}>
        <header className="wiki-dialog-head wiki-delete-head">
          <span className="wiki-delete-mark"><TrashIcon /></span>
          <h2 id={head}>Delete wiki</h2>
          <button type="button" className="wiki-quiet" aria-label="Close" disabled={busy} onClick={close}><DocIcon name="close" /></button>
        </header>
        <div className="wiki-dialog-body wiki-delete-body">
          <p className="wiki-dialog-name" lang={THAI.test(wiki.title) ? 'th' : undefined}>{wiki.title}</p>
          <label><span lang="th">กรอกชื่อ wiki ที่ต้องการลบ</span><input ref={confirmInput} value={typed} disabled={busy} autoComplete="off" spellCheck={false}
            onChange={(e) => setTyped(e.target.value)} /></label>
          {error && <p className="docs-error" role="alert">{error}</p>}
        </div>
        <footer className="wiki-dialog-actions wiki-delete-actions">
          <button type="button" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className="wiki-danger wiki-danger-fill" disabled={busy || !matches} aria-busy={busy}>
            <DocIcon name="trash" />{busy ? 'Deleting…' : 'Delete'}
          </button>
        </footer>
      </form>
    </dialog>
  </>;
}

export default function DeleteWikiSection({ wiki }: { wiki: { id: string; title: string } }) {
  return <div className="wiki-settings-group" role="group" aria-labelledby="wiki-delete-head">
    <h3 id="wiki-delete-head">Delete</h3>
    <p className="aside">Deleting removes the wiki and everything in it for every member. Only the owner or the install admin can do this, and it cannot be undone.</p>
    <DeleteWikiButton wiki={wiki} />
  </div>;
}
