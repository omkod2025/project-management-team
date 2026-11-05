import { listWikis, type WikiSummary } from '@/lib/wiki';
import Bell from '../bell';
import { requireReader } from './load-workspace';
import NewWikiForm from './new-wiki-form';
import '../p/[slug]/list.css';
import '../p/[slug]/docs/docs.css';
import './wiki.css';

const ACCESS: Record<WikiSummary['role'], string> = {
  install: 'Install admin', owner: 'Owner', write: 'Read and write', read: 'Read',
};

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

function WikiTable({ wikis, caption }: { wikis: WikiSummary[]; caption: string }) {
  return <div className="docs-table-wrap">
    <table className="docs-table">
      <caption className="docs-sr-only">{caption}</caption>
      <thead><tr><th scope="col">Wiki</th><th scope="col">Owner</th><th scope="col">Your access</th><th scope="col">Updated</th></tr></thead>
      <tbody>{wikis.map((w) => <tr key={w.id}>
        <th scope="row"><a href={`/wiki/${w.id}`}>{w.title}</a>{w.description && <span className="wiki-row-description">{w.description}</span>}</th>
        <td>{w.ownerName ?? 'Former member'}</td>
        <td>{ACCESS[w.role]}</td>
        <td><time dateTime={w.updatedAt}>{day.format(new Date(w.updatedAt))}</time></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

/**
 * The Wiki menu (คลังความรู้): every wiki this person can see, and a new
 * one. Archived wikis reach only their owner and the install admin, and
 * stand apart under Archived (spec §5c).
 */
export default async function WikiIndex() {
  const userId = await requireReader();
  const wikis = await listWikis(userId);
  const live = wikis.filter((w) => !w.archived);
  const archived = wikis.filter((w) => w.archived);

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <header className="head">
      <a href="/">Projects</a>
      <span className="docs-project">Wiki</span>
      <Bell />
      <nav className="views" aria-label="Wiki menu">
        <span aria-current="page">Wikis</span>
        <a href="/wiki/tokens">Tokens / MCP</a>
        <a href="/wiki/mermaid-guide">Mermaid guide</a>
      </nav>
    </header>
    <div className="docs-content">
      <div className="docs-heading">
        <div><h1>Wiki</h1><p lang="th">คลังความรู้ — knowledge that belongs to no single project.</p></div>
      </div>
      <NewWikiForm />
      <h2 className="wiki-section-head">Your wikis</h2>
      {live.length ? <WikiTable wikis={live} caption="Wikis you can read" /> : <div className="docs-empty">
        <h2>No wikis yet</h2><p>Create one above. You decide who else can read or write it.</p>
      </div>}
      {archived.length > 0 && <section aria-labelledby="wiki-archived-head">
        <h2 id="wiki-archived-head" className="wiki-section-head">Archived</h2>
        <p className="docs-muted">Only the owner and the install admin see these. Restore one from its settings.</p>
        <WikiTable wikis={archived} caption="Archived wikis" />
      </section>}
    </div>
  </main></div>;
}
