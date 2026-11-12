'use client';

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { DocPage } from '@/lib/doc-rules';
import { wikiEndpoints } from '@/lib/doc-endpoints';
import DocIcon from '../p/[slug]/docs/doc-icon';
import DocContent from '../p/[slug]/docs/doc-content';
import PageOutline from '../p/[slug]/docs/page-outline';
import { SidebarProvider } from '@/components/ui/sidebar';
import AppHeader, { wikiViews } from '../app-header';
import { PagesBar, PagesTrigger } from '../p/[slug]/docs/doc-page-tree';
import WikiTree from './wiki-tree';
import WikiTransfer from './wiki-transfer';
import type { TreePage } from './wiki-tree-order';
import '../p/[slug]/list.css';
import '../p/[slug]/docs/docs.css';
import '../p/[slug]/docs/editor.css';
import './wiki.css';

const PageEditor = dynamic(() => import('../p/[slug]/docs/page-editor'), { ssr: false, loading: () => <p role="status">Loading editor…</p> });

export type WorkspaceProps = {
  wiki: { id: string; title: string; description: string; archived: boolean };
  pages: TreePage[];
  archivedPages: { id: string; title: string; parentId: string | null }[];
  /** The page being read, already in the Docs shape (`asDocPage`). */
  page?: DocPage;
  canWrite: boolean;
  canManage: boolean;
  /** Owner and install admin: may delete a page in Deleted pages for good (D-82). */
  canDelete: boolean;
  initialEditing?: boolean;
};

const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

/**
 * One wiki: the tree on the left, the page on the right. Read mode is
 * `DocContent`; editing is Docs' own `PageEditor` against the wiki's routes,
 * so a wiki page edits exactly as a Docs Free page does.
 */
export default function WikiWorkspace({ wiki, pages, archivedPages, page: serverPage, canWrite, canManage, canDelete, initialEditing }: WorkspaceProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  // A save just made is newer than the server render until the refresh lands.
  const [savedPage, setSavedPage] = useState<Pick<DocPage, 'id' | 'content' | 'title' | 'updatedAt'> | null>(null);
  const page = serverPage && savedPage?.id === serverPage.id && savedPage.updatedAt > serverPage.updatedAt
    ? { ...serverPage, ...savedPage } : serverPage;
  const [editing, setEditing] = useState(!!initialEditing && canWrite && !!serverPage);
  const [pageTitle, setPageTitle] = useState(page?.title ?? '');
  const [editActions, setEditActions] = useState<HTMLDivElement | null>(null);
  const reading = useRef<HTMLDivElement>(null);
  const base = `/wiki/${wiki.id}`;
  // Stable across renders: the editor's save callback depends on it.
  const endpoints = useMemo(() => wikiEndpoints(wiki.id), [wiki.id]);
  const crumbs: TreePage[] = [];
  for (let at = page?.parentId; at;) {
    const p = pages.find((item) => item.id === at);
    if (!p) break;
    crumbs.unshift(p); at = p.parentId;
  }
  const children = page ? pages.filter((p) => p.parentId === page.id) : [];
  const metadata = page && <div className="doc-page-meta"><p className="docs-muted">Last updated {stamp(page.updatedAt)}</p></div>;

  function finishEditing(saved: { content: DocPage['content']; title: string; updatedAt: string }) {
    if (!page) return;
    setSavedPage({ id: page.id, ...saved });
    setEditing(false);
    window.history.replaceState(null, '', `${base}/${page.slug}`);
    startRefresh(() => router.refresh());
  }

  return <div className="book docs-book wiki-book"><main className="docs-main">
    <AppHeader
      title={<><h1>{wiki.title}</h1>{wiki.archived && <span className="wiki-flag">Archived</span>}</>}
      navLabel="Wiki views"
      views={wikiViews('Pages', { id: wiki.id, canSettings: canManage || canWrite })}
    />
    <SidebarProvider className="doc-shell" style={{ '--sidebar-width': '280px' } as CSSProperties}>
      <PagesBar title={wiki.title} />
      <WikiTree wiki={wiki} pages={pages} archivedPages={archivedPages} currentId={page?.id} currentTitle={pageTitle}
        canWrite={canWrite} canDelete={canDelete} locked={editing} />
      <div ref={reading} className="doc-reading">
        {editing && <div ref={setEditActions} className="doc-edit-actions" role="group" aria-label="Editing actions" />}
        {page && !editing && <PageOutline key={page.id} container={reading} />}
        <div className="doc-reading-body">
          {!editing && <div className="wiki-reading-tools">
            <PagesTrigger controls="wiki-page-index" />
            <WikiTransfer key={page?.id ?? 'wiki'} wiki={wiki} page={page} hasPages={pages.length > 0} canWrite={canWrite} endpoints={endpoints} disabled={refreshing} />
          </div>}
          {page ? <>
            {crumbs.length > 0 && <div className="doc-breadcrumb wiki-breadcrumb"><a href={base}>{wiki.title}</a>
              {crumbs.map((p) => <span key={p.id}> / <a href={`${base}/${p.slug}`}>{p.title}</a></span>)}</div>}
            {editing
              ? <PageEditor key={page.id} actionsContainer={editActions} page={page} endpoints={endpoints} focusTitle={page.title === 'Untitled'}
                  metadata={metadata} onTitleSaved={setPageTitle} onDone={finishEditing} />
              : <>
                <div className="doc-page-heading"><h1>{pageTitle}</h1>
                  {canWrite && <button type="button" className="docs-primary" disabled={refreshing} onClick={() => setEditing(true)}><DocIcon name="edit" />Edit page</button>}
                </div>
                {metadata}
                <article className="doc-prose">
                  {page.content.body ? <DocContent value={page.content.body} /> : <p className="docs-muted">Nothing written yet.</p>}
                </article>
                {children.length > 0 && <nav className="doc-subpages" aria-label="Subpages"><h2>Subpages</h2>
                  {children.map((p) => <a key={p.id} href={`${base}/${p.slug}`}><DocIcon name="file" />{p.title}</a>)}</nav>}
              </>}
          </> : <div className="doc-overview">
            <h1>{wiki.title}</h1>
            {wiki.description && <p className="wiki-description">{wiki.description}</p>}
            <p className="docs-muted">{pages.length} {pages.length === 1 ? 'page' : 'pages'}</p>
            <p>{pages.length ? 'Choose a page from the list.' : canWrite ? 'Add the first page with New page, or import a file.' : wiki.archived ? 'This wiki is archived.' : 'The owner or a writer can add the first page.'}</p>
          </div>}
        </div>
      </div>
    </SidebarProvider>
  </main></div>;
}
