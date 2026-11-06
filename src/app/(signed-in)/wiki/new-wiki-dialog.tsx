'use client';

import { useRef, useState } from 'react';
import DocIcon from '../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from './wiki-api';
import { hardNavigate } from '@/lib/hard-navigate';

/**
 * Any active signed-in person may start a wiki, and owns what they start (spec §5a).
 *
 * The trigger stands at the top right of the Wiki heading; the form opens in a
 * native modal `<dialog>`, so focus is held inside, Escape cancels and the
 * register behind it goes inert without any hand-rolled trap. It is a leaf laid
 * over the page — white ground, one hairline rule, square corners, no shadow.
 * While the wiki is being created the dialog cannot be dismissed, so a stray
 * Escape never strands a request whose result nobody is waiting for.
 */
export default function NewWikiDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function open() {
    setTitle(''); setDescription(''); setError('');
    dialog.current?.showModal();
    titleInput.current?.focus();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
    trigger.current?.focus();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const wiki = await wikiCall<{ id: string }>('/api/wikis', 'POST', { title, description });
      hardNavigate(`/wiki/${wiki.id}`);
    } catch (err) { setError(problem(err, 'The wiki could not be created. Try again.')); setBusy(false); }
  }

  return <>
    <button ref={trigger} className="docs-primary" type="button" aria-haspopup="dialog" onClick={open}>
      <DocIcon name="plus" />Create wiki
    </button>
    <dialog ref={dialog} className="wiki-dialog" aria-labelledby="new-wiki-head"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form className="wiki-dialog-sheet" onSubmit={(e) => void create(e)}>
        <header className="wiki-dialog-head">
          <h2 id="new-wiki-head">New wiki</h2>
          <button type="button" className="wiki-quiet" aria-label="Close" disabled={busy} onClick={close}><DocIcon name="close" /></button>
        </header>
        <div className="wiki-dialog-body">
          <label>Wiki title<input value={title} required maxLength={200} disabled={busy} ref={titleInput}
            onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Description <span className="docs-muted">(optional)</span><input value={description} maxLength={1000} disabled={busy}
            onChange={(e) => setDescription(e.target.value)} /></label>
          <p className="docs-muted">You become its owner. Nobody else can see it until you add them in its settings.</p>
          {error && <p className="docs-error" role="alert">{error}</p>}
        </div>
        <footer className="wiki-dialog-actions">
          <button type="button" disabled={busy} onClick={close}>Cancel</button>
          <button className="docs-primary" type="submit" disabled={busy || !title.trim()} aria-busy={busy}>
            <DocIcon name="plus" />{busy ? 'Creating…' : 'Create wiki'}
          </button>
        </footer>
      </form>
    </dialog>
  </>;
}
