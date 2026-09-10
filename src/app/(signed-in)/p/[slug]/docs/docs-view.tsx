'use client';
import DocIcon from "./doc-icon";

import { useRef, useState } from 'react';
import type { DocSummary } from '@/lib/doc-rules';
import '../list.css';
import './docs.css';
import Bell from '../../../bell';

type Props = {
  project: { id: string; name: string; slug: string };
  initialDocs: DocSummary[];
  canCreate: boolean;
};

export default function DocsView({ project, initialDocs, canCreate }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const visible = docs.filter((d) => `${d.title} ${d.version}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const base = `/p/${project.slug}`;

  function closeForm() {
    setCreating(false);
    setTitle('');
    setVersion('');
    setError('');
    newButton.current?.focus();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/projects/${project.id}/docs`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, version }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.message ?? 'The document could not be created. Try again.'); return; }
      const doc = body as DocSummary;
      setDocs((current) => [doc, ...current]);
      setQuery('');
      closeForm();
      setNotice(`Created “${doc.title}”.`);
    } catch {
      setError('Could not confirm the save. Check your connection and reload the list before retrying.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="book docs-book">
      <main className="docs-main">
        <header className="head">
          <a className="shelf label" href="/">Projects</a>
          <span className="docs-project">{project.name}</span>
          {/* The bell stands immediately before the view nav, so notice and
              navigation sit together in the one cluster this header already
              uses for "where do I go from here" (spec 11 §6). */}
          <Bell />
          <nav className="views label" aria-label="Project views">
            <a href={base}>List</a><a href={`${base}/timeline`}>Timeline</a>
            <a href={`${base}/report`}>Report</a><span aria-current="page">Docs</span>
            {canCreate && <a href={`${base}/settings`}>Settings</a>}
          </nav>
        </header>

        <div className="docs-content">
          <div className="docs-heading">
            <div><h1>Docs</h1><p>Scope, decisions and reference material for {project.name}.</p></div>
            {canCreate && <button ref={newButton} className="docs-primary" type="button"
              aria-expanded={creating} aria-controls="new-doc-form"
              onClick={() => { setCreating(true); setNotice(''); }}>+ New doc</button>}
          </div>

          {creating && <form id="new-doc-form" className="docs-create" onSubmit={(e) => void create(e)} aria-labelledby="new-doc-title">
            <h2 id="new-doc-title">New document</h2>
            <div className="docs-form-fields">
              <label>Document title<input name="title" value={title} autoFocus required maxLength={200}
                disabled={saving} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project overview" /></label>
              <label>Version <span className="docs-muted">(optional)</span><input name="version" value={version} maxLength={100}
                disabled={saving} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. V.1.0.0" /></label>
            </div>
            <p className="docs-muted">This document belongs to {project.name}. Project members can view it.</p>
            {error && <p className="docs-error" role="alert">{error}</p>}
            <div className="docs-actions">
              <button className="docs-primary" type="submit" disabled={saving || !title.trim()}><DocIcon name="plus" />{saving ? 'Creating…' : 'Create document'}</button>
              <button type="button" disabled={saving} onClick={closeForm}><DocIcon name="close" />Cancel</button>
            </div>
          </form>}

          <p className="docs-notice" role="status">{notice}</p>
          <div className="docs-tools">
            <label className="docs-search">Search docs<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or version" /></label>
            <span className="docs-muted" role="status">{visible.length} {visible.length === 1 ? 'document' : 'documents'}</span>
            {query && <button type="button" onClick={() => setQuery('')}><DocIcon name="close" />Clear search</button>}
          </div>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <caption className="docs-sr-only">Documents in {project.name}</caption>
              <thead><tr><th scope="col">Document</th><th scope="col">Version</th><th scope="col">Created by</th><th scope="col">Updated</th></tr></thead>
              <tbody>{visible.map((doc) => <tr key={doc.id}>
                <th scope="row"><a href={`${base}/docs?doc=${doc.id}`}>{doc.title}</a></th><td>{doc.version || '—'}</td>
                <td>{doc.createdByName ?? 'Former member'}</td>
                <td><time dateTime={doc.updatedAt}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(doc.updatedAt))}</time></td>
              </tr>)}</tbody>
            </table>
            {visible.length === 0 && <div className="docs-empty">
              <h2>{query.trim() ? 'No matching documents' : 'No documents yet'}</h2>
              <p>{query.trim() ? 'Try another title or version, or clear the search.' : canCreate
                ? 'Create the first document to keep this project’s knowledge together.'
                : 'A project admin can create the first document.'}</p>
            </div>}
          </div>
        </div>
      </main>
    </div>
  );
}
