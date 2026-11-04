'use client';

import { useState } from 'react';
import DocIcon from '../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from './wiki-api';

/** Any active signed-in person may start a wiki, and owns what they start (spec §5a). */
export default function NewWikiForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const wiki = await wikiCall<{ id: string }>('/api/wikis', 'POST', { title, description });
      window.location.assign(`/wiki/${wiki.id}`);
    } catch (err) { setError(problem(err, 'The wiki could not be created. Try again.')); setBusy(false); }
  }

  return <form className="docs-create" onSubmit={(e) => void create(e)} aria-labelledby="new-wiki-head">
    <h2 id="new-wiki-head">New wiki</h2>
    <div className="docs-form-fields">
      <label>Wiki title<input value={title} required maxLength={200} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Description <span className="docs-muted">(optional)</span><input value={description} maxLength={1000} disabled={busy} onChange={(e) => setDescription(e.target.value)} /></label>
    </div>
    <p className="docs-muted">You become its owner. Nobody else can see it until you add them in its settings.</p>
    {error && <p className="docs-error" role="alert">{error}</p>}
    <div className="docs-actions"><button className="docs-primary" type="submit" disabled={busy || !title.trim()}><DocIcon name="plus" />{busy ? 'Creating…' : 'Create wiki'}</button></div>
  </form>;
}
