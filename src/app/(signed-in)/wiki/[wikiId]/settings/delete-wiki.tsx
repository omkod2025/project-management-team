'use client';

import { useRef, useState } from 'react';
import DocIcon from '../../../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from '../../wiki-api';

/**
 * Deleting a wiki, for good (D-82). Drawn for the install admin only — the
 * route refuses everyone else, and this is never offered to someone it would
 * refuse.
 *
 * A modal, deliberately: nothing here can be undone, so it needs both the
 * interruption and the protected focus. The delete button stays disabled
 * until the wiki's title is typed back exactly, which no stray Return can do.
 * Archive is offered in the same breath, because it is usually what is meant.
 */
export default function DeleteWikiSection({ wiki }: { wiki: { id: string; title: string } }) {
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
      window.location.assign('/wiki');
    } catch (err) { setError(problem(err, 'The wiki was not deleted. Reload and try again.')); setBusy(false); }
  }

  return <section className="wiki-settings-section" aria-labelledby="wiki-delete-head">
    <h2 id="wiki-delete-head">Delete</h2>
    <p className="docs-muted">Deleting removes the wiki and everything in it for every member. Only the install admin can do this, and it cannot be undone.</p>
    <button ref={trigger} type="button" className="wiki-danger" aria-haspopup="dialog" onClick={open}>
      <DocIcon name="trash" />Delete wiki…
    </button>
    <dialog ref={dialog} className="wiki-dialog" aria-labelledby="delete-wiki-head"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form className="wiki-dialog-sheet" onSubmit={(e) => void remove(e)}>
        <header className="wiki-dialog-head">
          <h2 id="delete-wiki-head">Delete wiki</h2>
          <button type="button" className="wiki-quiet" aria-label="Close" disabled={busy} onClick={close}><DocIcon name="close" /></button>
        </header>
        <div className="wiki-dialog-body">
          <p className="wiki-dialog-name" lang="th">{wiki.title}</p>
          <p>Every page and its history, every uploaded file, the member list, the public link and every token’s access to this wiki are deleted. This cannot be undone.</p>
          <p className="docs-muted">To hide it and keep the option of bringing it back, archive it instead.</p>
          <label>Type the wiki title to confirm<input ref={confirmInput} value={typed} disabled={busy} autoComplete="off" spellCheck={false}
            onChange={(e) => setTyped(e.target.value)} /></label>
          {error && <p className="docs-error" role="alert">{error}</p>}
        </div>
        <footer className="wiki-dialog-actions">
          <button type="button" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className="wiki-danger wiki-danger-fill" disabled={busy || !matches}>
            <DocIcon name="trash" />{busy ? 'Deleting…' : 'Delete for good'}
          </button>
        </footer>
      </form>
    </dialog>
  </section>;
}
