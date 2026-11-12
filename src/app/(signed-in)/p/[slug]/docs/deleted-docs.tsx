'use client';

import { useState } from 'react';
import { DOC_PURGE_NOTE, type ArchivedDocSummary, type DocSummary } from '@/lib/doc-rules';
import ConfirmDelete, { TrashIcon } from '../../../confirm-delete';
import DocIcon from './doc-icon';

const deletedOn = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

async function failure(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.message ?? fallback);
}

/**
 * Deleted documents, for a project admin (D-61, updated 2026-11-12): Restore
 * puts one back in the list, Delete permanently removes it and every page.
 * Folded away by default — it is the back room, not the shelf.
 */
export default function DeletedDocs({ docs, onRestored, onPurged }: {
  docs: ArchivedDocSummary[];
  onRestored: (doc: DocSummary) => void;
  onPurged: (doc: ArchivedDocSummary) => void;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [purging, setPurging] = useState<ArchivedDocSummary | null>(null);

  async function restore(doc: ArchivedDocSummary) {
    if (working) return;
    setWorking(doc.id); setError('');
    try {
      const res = await fetch(`/api/docs/${doc.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'restore' }),
      });
      if (!res.ok) throw await failure(res, 'The document was not restored. Try again.');
      onRestored(await res.json() as DocSummary);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The document was not restored. Try again.');
    } finally { setWorking(null); }
  }

  async function purge(doc: ArchivedDocSummary) {
    const res = await fetch(`/api/docs/${doc.id}?permanent=1`, { method: 'DELETE' });
    if (!res.ok) throw await failure(res, 'Nothing was deleted. Try again.');
    setPurging(null);
    onPurged(doc);
  }

  if (!docs.length) return null;
  return (
    <details className="docs-archived">
      <summary>Deleted documents ({docs.length})</summary>
      <ul>
        {docs.map((doc) => <li key={doc.id}>
          <span className="docs-archived-name">{doc.title}{doc.version && <span className="docs-muted"> · {doc.version}</span>}</span>
          <span className="docs-muted">Deleted <time dateTime={doc.archivedAt}>{deletedOn.format(new Date(doc.archivedAt))}</time></span>
          <span className="docs-archived-actions">
            <button type="button" disabled={!!working} aria-busy={working === doc.id} onClick={() => void restore(doc)}
              aria-label={`Restore document ${doc.title}`}><DocIcon name="history" />Restore</button>
            <button type="button" className="doc-purge" disabled={!!working} onClick={() => { setPurging(doc); setError(''); }}
              aria-label={`Delete document ${doc.title} permanently`}><TrashIcon />Delete permanently</button>
          </span>
        </li>)}
      </ul>
      {error && <p className="docs-error" role="alert">{error}</p>}
      {purging && <ConfirmDelete title="Delete permanently" name={purging.title}
        confirmText={purging.title} confirmLabel="กรอกชื่อ Doc ที่ต้องการลบ" note={DOC_PURGE_NOTE}
        onConfirm={() => purge(purging)} onCancel={() => setPurging(null)} />}
    </details>
  );
}
