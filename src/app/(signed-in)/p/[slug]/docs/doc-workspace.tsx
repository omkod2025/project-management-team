'use client';
import DocIcon from "./doc-icon";

import { useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { DocPage, PageTemplate } from '@/lib/doc-rules';
import PageStyles, { type ReadingStyle } from './page-styles';
import PageTools from './page-tools';
import PageOutline from './page-outline';
import PurgePage from './purge-page';
import { pageDeletion, pageDeletionNote, pageMarkdown, pageSections } from '@/lib/doc-rules';
import DocContent from './doc-content';
import '../list.css';
import './docs.css';
import './editor.css';
import AppHeader from '../../../app-header';
import ConfirmDelete from '../../../confirm-delete';
import { projectViews } from '../project-views';
import { projectDocEndpoints } from '@/lib/doc-endpoints';
import { hardNavigate } from '@/lib/hard-navigate';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarProvider, SidebarRail } from '@/components/ui/sidebar';
import { ancestorIds, DocRowActions, FoldAll, PageTree, PagesBar, PagesTrigger } from './doc-page-tree';

const PageEditor = dynamic(() => import('./page-editor'), { ssr: false, loading: () => <p role="status">Loading editor…</p> });
type Props = {
  project: { id: string; name: string; slug: string };
  doc: { id: string; title: string; version: string };
  pages: DocPage[]; page?: DocPage;
  archivedPages?: { id: string; title: string; parentId: string | null }[];
  bindableNodes: { id: string; name: string }[];
  canCreate: boolean; canEdit: boolean; initialEditing?: boolean; children?: React.ReactNode;
};

function readingStyleOf(settings: DocPage['settings'] | undefined): ReadingStyle {
  const s = settings ?? {};
  return { font: (s.font ?? 'system') as ReadingStyle['font'], size: (s.size ?? 'default') as ReadingStyle['size'], wide: !!s.wide };
}

export default function DocWorkspace({ project, doc, pages, page: serverPage, archivedPages=[], bindableNodes, canCreate, canEdit, initialEditing, children }: Props) {
  const [savedPage, setSavedPage] = useState<Pick<DocPage, 'id' | 'content' | 'title' | 'updatedAt'> | null>(null);
  const page = serverPage && savedPage?.id === serverPage.id && savedPage.updatedAt > serverPage.updatedAt
    ? { ...serverPage, ...savedPage } : serverPage;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [editActions, setEditActions] = useState<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(!!initialEditing && canEdit && !page?.protected);
  const [pageTitle, setPageTitle] = useState(page?.title ?? '');
  const [focusTitle, setFocusTitle] = useState(!!initialEditing && page?.title === 'Untitled');
  const [readingStyle, setReadingStyle] = useState<ReadingStyle>(() => readingStyleOf(page?.settings));
  // The page's saved settings win when they change: adjusted while rendering, not in an effect.
  const [seenSettings, setSeenSettings] = useState(page?.settings);
  if (page?.settings !== seenSettings) { setSeenSettings(page?.settings); setReadingStyle(readingStyleOf(page?.settings)); }
  const reading = useRef<HTMLDivElement>(null);
  // Subpages start hidden; only the open page's ancestors are unfolded, so it is never buried.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorIds(pages, page?.id)));
  const [seenPageId, setSeenPageId] = useState(page?.id);
  if (page?.id !== seenPageId) {
    setSeenPageId(page?.id);
    setExpanded((old) => new Set([...old, ...ancestorIds(pages, page?.id)]));
  }
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<PageTemplate>('free');
  const [parentId, setParentId] = useState('');
  const [nodeId, setNodeId] = useState('');
  // Which action is in flight — 'quick', 'form' or a page id being restored — so only its button reads busy.
  const [working, setWorking] = useState<string | null>(null);
  const busy = working !== null;
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<DocPage | null>(null);
  const base = `/p/${project.slug}/docs`;
  // Stable across renders: the editor's save callback depends on it.
  const endpoints = useMemo(() => projectDocEndpoints(project.id), [project.id]);
  const ordered: DocPage[] = [];
  const walk = (parent: string | null) => {
    for (const p of pages.filter((p) => p.parentId === parent)) { ordered.push(p); walk(p.id); }
  };
  walk(null);
  const needle = query.trim().toLocaleLowerCase();
  // While searching the tree is flat: every match shows, whatever is folded.
  const matches = needle ? ordered.filter((p) => p.title.toLocaleLowerCase().includes(needle)) : null;
  const parents = pages.filter((p) => pages.some((child) => child.parentId === p.id)).map((p) => p.id);
  const allOpen = parents.length > 0 && parents.every((id) => expanded.has(id));
  const toggle = (id: string) => setExpanded((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const removal = removing ? pageDeletion(pages, removing.id) : null;
  const crumbs: DocPage[] = [];
  let ancestor = page?.parentId;
  while (ancestor) { const p = pages.find((p) => p.id === ancestor); if (!p) break; crumbs.unshift(p); ancestor = p.parentId; }

  /** Deleting a page archives it; it waits in Deleted pages for a Restore. */
  async function removePage() {
    if (!removing || editing) return;
    let res: Response;
    try {
      res = await fetch(`/api/doc-pages/${removing.id}/tools`, {
        method: 'POST', headers: { 'content-type':'application/json' },
        body: JSON.stringify({ action:'archive', updatedAt:removing.updatedAt }),
      });
    } catch { throw new Error('Could not confirm deletion. Reload before retrying.'); }
    const result = await res.json();
    if (!res.ok) throw new Error(result.message ?? 'Could not delete this page.');
    // Return to the document index, including when its last page was removed.
    hardNavigate(`${base}?doc=${doc.id}`);
  }

  async function restorePage(pageId: string) {
    if (busy) return;
    setWorking(pageId); setError('');
    try {
      const res = await fetch(`/api/docs/${doc.id}/pages`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message);
      hardNavigate(`${base}/${body.slug}`);
    } catch (e) { setError(e instanceof Error && e.message ? e.message : 'Restore failed.'); }
    finally { setWorking(null); }
  }

  async function add(e?: React.FormEvent, quick = false) {
    e?.preventDefault(); if (busy) return;
    setWorking(quick ? 'quick' : 'form'); setError('');
    try {
      const res = await fetch(`/api/docs/${doc.id}/pages`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(quick ? { title: 'Untitled', template: 'free' } : { title, template, parentId: parentId || null, nodeId: template === 'module' ? nodeId || null : null }) });
      const body = await res.json();
      if (!res.ok) { setError(body.message ?? 'Could not create this page.'); return; }
      hardNavigate(`${base}/${body.slug}?edit=1`);
    } catch { setError('Could not confirm creation. Reload the document before retrying.'); }
    finally { setWorking(null); }
  }
  const metadata = page && <div className="doc-page-meta">{page.settings?.subtitle && <p className="doc-subtitle">{String(page.settings.subtitle)}</p>}{page.ownerNames?.length ? <p>Owners: {page.ownerNames.join(', ')}</p> : null}<p className="docs-muted">{doc.version || 'No version stamp'}{page.settings?.showModified!==false && <> · Last updated {new Date(page.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</>}{page.nodeArchived ? ' · Module archived' : ''}{page.protected ? ' · Protected' : ''}</p></div>;

  return <div className="book docs-book"><main className="docs-main">
    <AppHeader title={project.name} navLabel="Project views"
      views={projectViews(project.slug, 'Docs', { canSettings: canCreate })} />
    <SidebarProvider className="doc-shell" style={{ "--sidebar-width": "280px" } as React.CSSProperties}>
      <PagesBar title={doc.title} />
      {/* Focus mode is the page alone: the tree steps out of the way entirely. */}
      {readingStyle.focus !== 'page' && <Sidebar>
      <aside id="doc-page-index" className="doc-pages docs-book" aria-label="Document pages">
        <SidebarHeader className="doc-pages-head">
          <a href={`${base}?doc=${doc.id}`} className="doc-name">{doc.title}</a>
          <p className="docs-muted">{doc.version || 'No version stamp'}</p>
          <SidebarInput type="search" aria-label="Find a page" placeholder="Find a page" value={query} onChange={(e) => setQuery(e.target.value)} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="doc-pages-group">
            <div className="doc-pages-label"><SidebarGroupLabel>{matches ? `${matches.length} found` : 'Pages'}</SidebarGroupLabel>
              {!matches && parents.length > 0 && <FoldAll allOpen={allOpen} onClick={() => setExpanded(allOpen ? new Set() : new Set(parents))} />}</div>
            <nav aria-label="Pages">
              <PageTree matches={matches} pages={pages} currentId={page?.id} currentTitle={pageTitle} base={base} expanded={expanded} onToggle={toggle}
                actions={(p) => <DocRowActions page={p} canCreate={canCreate} editing={editing} busy={busy}
                  onAddSubpage={(q) => { setParentId(q.id); setTitle(''); setAdding(true); }}
                  onRemove={(q) => { setRemoving(q); setError(''); setAdding(false); }} />} />
            </nav>
            {!(matches ?? pages).length && <p className="docs-muted doc-pages-empty">{matches ? 'No matching pages.' : 'No pages yet.'}</p>}
          </SidebarGroup>
        </SidebarContent>
        {removing && <ConfirmDelete title="Delete page" name={removing.title}
          blocked={removal?.lockedBy ? `The subpage "${removal.lockedBy}" is protected. Unlock it first.` : undefined}
          note={pageDeletionNote(removal?.subpages ?? 0)}
          onConfirm={removePage} onCancel={() => setRemoving(null)} />}
        <SidebarFooter className="doc-pages-foot">
        {canCreate && <div className="doc-add-actions"><button type="button" disabled={editing || busy} aria-busy={working === 'quick'} onClick={() => void add(undefined, true)}><DocIcon name="plus" />{busy ? 'Adding…' : 'Add page'}</button><button type="button" disabled={editing || busy} aria-label="New page options" onClick={() => { setParentId(''); setTitle(''); setAdding(!adding); }} aria-expanded={adding}><DocIcon name="chevron" /></button></div>}
        {error && !adding && <p role="alert">{error}</p>}
        {canCreate && !!archivedPages.length && <details className="doc-archived"><summary>Deleted pages ({archivedPages.length})</summary>
          {archivedPages.map((p) => <div key={p.id} className="doc-archived-row"><span>{p.title}</span><span className="doc-archived-actions">
            <button type="button" disabled={busy || editing} aria-busy={working === p.id} onClick={() => void restorePage(p.id)}><DocIcon name="history" />Restore</button>
            <PurgePage endpoint={`/api/docs/${doc.id}/pages`} page={p} archived={archivedPages} disabled={busy || editing} onDone={() => startRefresh(() => router.refresh())} />
          </span></div>)}
        </details>}
        </SidebarFooter>
      </aside>
      <SidebarRail />
      </Sidebar>}
      <div ref={reading} className={`doc-reading font-${readingStyle.font} size-${readingStyle.size} focus-${readingStyle.focus??'none'}${readingStyle.wide ? ' is-wide' : ''}`}>
        {editing && <div ref={setEditActions} className="doc-edit-actions" role="group" aria-label="Editing actions" />}
        {page && <PageOutline key={page.id} container={reading} />}
        <div className="doc-reading-body">
        {page && <PageStyles value={readingStyle} onChange={setReadingStyle} container={reading} />}
        {page && <PageTools page={page} pages={pages} base={base} projectId={project.id} canCreate={canCreate} canEdit={canEdit} editing={editing} container={reading} />}
        {adding && <form className="docs-create" onSubmit={(e) => void add(e)}>
          <h2>New page</h2><div className="docs-form-fields">
            <label>Page title<input required={!nodeId || template === 'free'} maxLength={200} value={title} disabled={busy || (template === 'module' && !!nodeId)} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
            <details className="doc-create-options"><summary>Template & location{parentId ? ' · Subpage' : ''}</summary>
            <label>Template<select value={template} disabled={busy} onChange={(e) => setTemplate(e.target.value as PageTemplate)}><option value="free">Free — one continuous page</option><option value="module">Module — five scope sections</option></select></label>
            <label>Parent page<select value={parentId} disabled={busy} onChange={(e) => setParentId(e.target.value)}><option value="">Top level</option>{ordered.filter((p) => p.depth < 3).map((p) => <option key={p.id} value={p.id}>{'— '.repeat(p.depth - 1)}{p.title}</option>)}</select></label>
            {template === 'module' && <label>Linked module / task<select value={nodeId} disabled={busy} onChange={(e) => setNodeId(e.target.value)}><option value="">None — use page title</option>{bindableNodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}
            </details>
          </div><p className="docs-muted">Create a blank page and start writing. Template and location are optional.</p>
          {error && <p role="alert">{error}</p>}<div className="docs-actions"><button className="docs-primary" disabled={busy} aria-busy={working === 'form'}><DocIcon name="plus" />{busy ? 'Creating…' : 'Create page'}</button><button type="button" disabled={busy} onClick={() => setAdding(false)}><DocIcon name="close" />Cancel</button></div>
        </form>}
        {page ? <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a user-uploaded cover of unknown size; next/image needs both dimensions */}
          {page.settings?.cover && <img className="doc-cover" alt="Page cover" src={String(page.settings.cover)} />}
          <div className="doc-reading-tools">{readingStyle.focus !== 'page' && <PagesTrigger controls="doc-page-index" />}<div className="doc-breadcrumb"><a href={`${base}?doc=${doc.id}`}>{doc.title}</a>{crumbs.map((p) => <span key={p.id}> / <a href={`${base}/${p.slug}`}>{p.title}</a></span>)}</div></div>
          {page.settings?.icon && <div className="doc-page-icon">{String(page.settings.icon)}</div>}
          {!editing && <><div className="doc-page-heading"><h1>{canEdit && !page.nodeId && !page.protected ? <button className="doc-title-button" title="Rename page" disabled={refreshing} onClick={() => { setFocusTitle(true); setAdding(false); setEditing(true); }}>{pageTitle}</button> : pageTitle}</h1>{canEdit && !page.protected && <button className="docs-primary" disabled={refreshing} onClick={() => { setFocusTitle(false); setAdding(false); setEditing(true); }}><DocIcon name="edit" />Edit page</button>}</div>{metadata}</>}

          {editing ? <PageEditor key={page.id} actionsContainer={editActions} page={page} endpoints={endpoints} focusTitle={focusTitle} metadata={metadata} onTitleSaved={setPageTitle} onDone={(saved) => { setSavedPage({ id: page.id, ...saved }); setEditing(false); window.history.replaceState(null, '', `${base}/${page.slug}`); startRefresh(() => router.refresh()); }} /> : <article className="doc-prose">{page !== serverPage ? pageSections(page.template).map(([key, label]) => <section key={key} className="doc-section">{page.template === 'module' && <h2>{label}</h2>}{page.content[key] ? <DocContent value={page.content[key]} /> : <p className="docs-muted">Nothing written yet.</p>}</section>) : children}</article>}
          {page.settings?.showStats && <p className="docs-muted doc-page-stats">{pageMarkdown(page.template,page.content).length.toLocaleString()} characters · {Math.max(1,Math.ceil(pageMarkdown(page.template,page.content).length/1000))} min read</p>}
          {!editing && pages.some(p=>p.parentId===page.id) && <nav className="doc-subpages" aria-label="Subpages"><h2>Subpages</h2>{pages.filter(p=>p.parentId===page.id).map(p=><a key={p.id} href={`${base}/${p.slug}`}>▤ {p.title}</a>)}</nav>}
        </> : <div className="doc-overview"><div className="doc-reading-tools"><PagesTrigger controls="doc-page-index" /></div><h1>{doc.title}</h1><p className="docs-muted">{doc.version || 'No version stamp'} · {pages.length} pages</p>
          <p>{pages.length ? 'Choose a page to read its scope, decisions and reference material.' : canCreate ? 'Add the first page to start writing.' : 'A project admin can add the first page.'}</p></div>}
        </div>
      </div>
    </SidebarProvider>
  </main></div>;
}
