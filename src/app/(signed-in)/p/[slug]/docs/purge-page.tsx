'use client';

import { useState } from 'react';
import { pagePurgeNote, pageSubtree } from '@/lib/doc-rules';
import ConfirmDelete, { TrashIcon } from '../../../confirm-delete';

type ArchivedPage = { id: string; title: string; parentId: string | null };

/**
 * "Delete permanently" beside Restore in Deleted pages, for a document's
 * (D-61) or a wiki's (D-82), both updated 2026-11-12. `endpoint` is the pages
 * route that takes `DELETE { pageId }`. The deleted subpages under it go too;
 * `onDone` receives every id that left, so a list can drop them without
 * another fetch.
 */
export default function PurgePage({ endpoint, page, archived, disabled, onDone }: {
  endpoint: string;
  page: ArchivedPage;
  archived: readonly ArchivedPage[];
  disabled?: boolean;
  onDone: (ids: Set<string>) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const ids = pageSubtree(archived, page.id);

  async function purge() {
    const res = await fetch(endpoint, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageId: page.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Nothing was deleted. Try again.');
    }
    setConfirming(false);
    onDone(ids);
  }

  return <>
    <button type="button" className="doc-purge" disabled={disabled} onClick={() => setConfirming(true)}
      aria-label={`Delete page ${page.title} permanently`}><TrashIcon />Delete permanently</button>
    {confirming && <ConfirmDelete title="Delete permanently" name={page.title} note={pagePurgeNote(ids.size - 1)}
      onConfirm={purge} onCancel={() => setConfirming(false)} />}
  </>;
}
