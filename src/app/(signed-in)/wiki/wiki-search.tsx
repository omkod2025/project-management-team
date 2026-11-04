'use client';

import { useRef, useState } from 'react';
import { problem, wikiCall } from './wiki-api';

type Hit = { pageId: string; slug: string; title: string; snippet: string };

/**
 * Search inside one wiki (spec §4b). The server matches every term Thai-safe;
 * this only asks and lists what came back. A newer search abandons the one
 * still in flight, so a slow answer never replaces a faster, later one.
 */
export default function WikiSearch({ wikiId }: { wikiId: string }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) { setHits(null); return; }
    const ticket = ++latest.current;
    setBusy(true); setError('');
    try {
      const found = await wikiCall<Hit[]>(`/api/wikis/search?wiki=${encodeURIComponent(wikiId)}&q=${encodeURIComponent(q)}`, 'GET');
      if (ticket === latest.current) setHits(found);
    } catch (err) {
      if (ticket === latest.current) setError(problem(err, 'Search failed. Try again.'));
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  }

  return <section className="wiki-search" aria-label="Search this wiki">
    <form role="search" onSubmit={(e) => void search(e)}>
      <label>Search this wiki<input type="search" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setHits(null); }} /></label>
      <button type="submit" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p role="alert" className="docs-error">{error}</p>}
    {hits && <div className="wiki-search-hits" role="status">
      {hits.length ? <ol>{hits.map((h) => <li key={h.pageId}>
        <a href={`/wiki/${wikiId}/${h.slug}`}>{h.title}</a>
        {h.snippet && <p>{h.snippet}</p>}
      </li>)}</ol> : <p className="docs-muted">No pages match.</p>}
    </div>}
  </section>;
}
