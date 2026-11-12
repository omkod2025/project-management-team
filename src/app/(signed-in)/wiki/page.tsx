import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { listWikis, type WikiSummary } from '@/lib/wiki';
import { parseWikiSort, sortWikis, type WikiListSort } from '@/lib/wiki-rules';
import AppHeader, { wikiViews } from '../app-header';
import { requireReader } from './load-workspace';
import NewWikiDialog from './new-wiki-dialog';
import { DeleteWikiButton } from './[wikiId]/settings/delete-wiki';
import SortMark from '@/components/sort-mark';
import '../p/[slug]/list.css';
import '../p/[slug]/docs/docs.css';
import './wiki.css';

const ACCESS: Record<WikiSummary['role'], string> = {
  install: 'Install admin', owner: 'Owner', write: 'Read and write', read: 'Read',
};

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });

/** Delete is the owner's and the install admin's (D-82); the role says so. */
const canDelete = (w: WikiSummary) => w.role === 'owner' || w.role === 'install';

/** The list opens A→Z by name; each click on the Wiki head flips the direction. */
const NEXT_SORT: Record<WikiListSort, string> = { name: '/wiki?sort=-name', '-name': '/wiki' };
const ARIA_SORT = { name: 'ascending', '-name': 'descending' } as const;
const SORT_HINT: Record<WikiListSort, string> = { name: 'Sort by wiki name, Z to A', '-name': 'Sort by wiki name, A to Z' };

function WikiTable({ wikis, caption, sort }: { wikis: WikiSummary[]; caption: string; sort: WikiListSort }) {
  const actions = wikis.some(canDelete);
  return <DataTable caption={caption} className="docs-table wiki-index">
      <thead><tr><th scope="col" aria-sort={ARIA_SORT[sort]}>
        <Link className="table-sort" href={NEXT_SORT[sort]} scroll={false} title={SORT_HINT[sort]}>Wiki<SortMark sort={sort} /></Link>
      </th><th scope="col">Owner</th><th scope="col">Your access</th><th scope="col">Updated</th>
        {actions && <th scope="col"><span className="docs-sr-only">Actions</span></th>}</tr></thead>
      <tbody>{wikis.map((w) => <tr key={w.id}>
        <th scope="row"><a href={`/wiki/${w.id}`}>{w.title}</a>{w.description && <span className="wiki-row-description">{w.description}</span>}</th>
        <td>{w.ownerName ?? 'Former member'}</td>
        <td>{ACCESS[w.role]}</td>
        <td><time dateTime={w.updatedAt}>{day.format(new Date(w.updatedAt))}</time></td>
        {actions && <td className="docs-row-actions">{canDelete(w) && <DeleteWikiButton compact wiki={{ id: w.id, title: w.title }} />}</td>}
      </tr>)}</tbody>
  </DataTable>;
}

/**
 * The Wiki menu (คลังความรู้): every wiki this person can see, and a new
 * one — Create wiki at the heading's top right opens its form in a modal.
 * Archived wikis reach only their owner and the install admin, and stand
 * apart under Archived (spec §5c). The Wiki column head sorts both tables
 * by name, A→Z by default and Z→A with `?sort=-name`.
 */
export default async function WikiIndex({ searchParams }: { searchParams: Promise<{ sort?: string | string[] }> }) {
  const [userId, query] = await Promise.all([requireReader(), searchParams]);
  const sort = parseWikiSort(query.sort);
  const wikis = sortWikis(await listWikis(userId), sort);
  const live = wikis.filter((w) => !w.archived);
  const archived = wikis.filter((w) => w.archived);

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <AppHeader title="Wiki" navLabel="Wiki menu" views={wikiViews('Wikis')} />
    <div className="docs-content data-page">
      <div className="docs-heading">
        <div><h1>Wiki</h1><p lang="th">คลังความรู้ — knowledge that belongs to no single project.</p></div>
        <NewWikiDialog />
      </div>
      <h2 className="wiki-section-head">Your wikis</h2>
      {live.length ? <WikiTable wikis={live} caption="Wikis you can read" sort={sort} /> : <div className="docs-empty">
        <h2>No wikis yet</h2><p>Start one with Create wiki. You decide who else can read or write it.</p>
      </div>}
      {archived.length > 0 && <section aria-labelledby="wiki-archived-head">
        <h2 id="wiki-archived-head" className="wiki-section-head">Archived</h2>
        <p className="docs-muted">Only the owner and the install admin see these. Restore one from its settings.</p>
        <WikiTable wikis={archived} caption="Archived wikis" sort={sort} />
      </section>}
    </div>
  </main></div>;
}
