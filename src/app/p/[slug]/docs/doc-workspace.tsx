'use client';
import DocIcon from "./doc-icon";

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { DocPage, PageTemplate } from '@/lib/doc-rules';
import PageStyles, { type ReadingStyle } from './page-styles';
import PageTools from './page-tools';
import PageOutline from './page-outline';
import { pageMarkdown } from '@/lib/doc-rules';
import '../list.css';
import './docs.css';
import './editor.css';

const PageEditor = dynamic(() => import('./page-editor'), { ssr: false, loading: () => <p role="status">Loading editor…</p> });
type Props = {
  project: { id: string; name: string; slug: string };
  doc: { id: string; title: string; version: string };
  pages: DocPage[]; page?: DocPage;
  archivedPages?: {id:string;title:string}[];
  bindableNodes: { id: string; name: string }[];
  canCreate: boolean; canEdit: boolean; initialEditing?: boolean; children?: React.ReactNode;
};

export default function DocWorkspace({ project, doc, pages, page, archivedPages=[], bindableNodes, canCreate, canEdit, initialEditing, children }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!initialEditing && canEdit && !page?.protected);
  const [pageTitle, setPageTitle] = useState(page?.title ?? '');
  const [focusTitle, setFocusTitle] = useState(!!initialEditing && page?.title === 'Untitled');
  const [readingStyle, setReadingStyle] = useState<ReadingStyle>({ font: 'system', size: 'default', wide: false });
  useEffect(()=>{ const s=page?.settings ?? {}; setReadingStyle({font:(s.font ?? 'system') as ReadingStyle['font'],size:(s.size ?? 'default') as ReadingStyle['size'],wide:!!s.wide}); },[page?.settings]);
  const reading = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<PageTemplate>('free');
  const [parentId, setParentId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showPages, setShowPages] = useState(false);
  const [removing, setRemoving] = useState<DocPage | null>(null);
  const base = `/p/${project.slug}/docs`;
  const ordered: DocPage[] = [];
  const walk = (parent: string | null) => {
    for (const p of pages.filter((p) => p.parentId === parent)) { ordered.push(p); walk(p.id); }
  };
  walk(null);
  const visible = ordered.filter((p) => {
    if (query.trim()) return p.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    let parent = p.parentId;
    while (parent) { if (collapsed.has(parent)) return false; parent = pages.find((item) => item.id === parent)?.parentId ?? null; }
    return true;
  });
  const crumbs: DocPage[] = [];
  let ancestor = page?.parentId;
  while (ancestor) { const p = pages.find((p) => p.id === ancestor); if (!p) break; crumbs.unshift(p); ancestor = p.parentId; }

  async function removePage() {
    if (!removing || busy || editing) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/doc-pages/${removing.id}/tools`, {
        method: 'POST', headers: { 'content-type':'application/json' },
        body: JSON.stringify({ action:'archive', updatedAt:removing.updatedAt }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message ?? 'Could not delete this page.');
      // Return to the document index, including when its last page was removed.
      window.location.assign(`${base}?doc=${doc.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm deletion. Reload before retrying.'); }
    finally { setBusy(false); }
  }

  async function add(e?: React.FormEvent, quick = false) {
    e?.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/docs/${doc.id}/pages`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(quick ? { title: 'Untitled', template: 'free' } : { title, template, parentId: parentId || null, nodeId: template === 'module' ? nodeId || null : null }) });
      const body = await res.json();
      if (!res.ok) { setError(body.message ?? 'Could not create this page.'); return; }
      window.location.assign(`${base}/${body.slug}?edit=1`);
    } catch { setError('Could not confirm creation. Reload the document before retrying.'); }
    finally { setBusy(false); }
  }
  const metadata = page && <div className="doc-page-meta">{page.settings?.subtitle && <p className="doc-subtitle">{String(page.settings.subtitle)}</p>}{page.ownerNames?.length ? <p>Owners: {page.ownerNames.join(', ')}</p> : null}<p className="docs-muted">{doc.version || 'No version stamp'}{page.settings?.showModified!==false && <> · Last updated {new Date(page.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</>}{page.nodeArchived ? ' · Module archived' : ''}{page.protected ? ' · Protected' : ''}</p></div>;

  return <div className="book docs-book"><main className="docs-main">
    <header className="head"><a href={base}>Docs</a><span className="docs-project">{project.name}</span>
      <nav className="views" aria-label="Project views"><a href={`/p/${project.slug}`}>List</a><a href={`/p/${project.slug}/timeline`}>Timeline</a><a href={base} aria-current="page">Docs</a></nav>
    </header>
    <div className="doc-workspace">
      <button className="doc-sidebar-toggle" type="button" aria-expanded={showPages} aria-controls="doc-page-index" onClick={() => setShowPages(!showPages)}><DocIcon name="file" />Pages · {doc.title}</button>
      <aside id="doc-page-index" className={`doc-sidebar${showPages ? ' is-open' : ''}`} aria-label="Document pages">
        <a href={`${base}?doc=${doc.id}`} className="doc-name">{doc.title}</a>
        <p className="docs-muted">{doc.version || 'No version stamp'}</p>
        <label className="doc-page-search">Find a page<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <nav aria-label="Pages">{visible.map((p) => <div className="doc-tree-row" key={p.id}>
          {pages.some((child) => child.parentId === p.id) && <button type="button" className="doc-tree-fold" aria-label={`${collapsed.has(p.id) ? 'Expand' : 'Collapse'} ${p.title}`} aria-expanded={!collapsed.has(p.id)} onClick={() => setCollapsed((old) => { const next = new Set(old); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}>{collapsed.has(p.id) ? '›' : '⌄'}</button>}
          <a href={`${base}/${p.slug}`} aria-current={p.id === page?.id ? 'page' : undefined}
          style={{ paddingLeft: 10 + (query ? 0 : p.depth - 1) * 16, ...(p.hue ? { borderLeft: `1px solid color-mix(in srgb, var(--color-tab-${p.hue}) 65%, white)` } : {}) }}>
          {p.id === page?.id ? pageTitle : p.title}{p.nodeArchived && <small>Module archived</small>}</a>
          {canCreate && p.depth < 3 && <button type="button" className="doc-tree-add" aria-label={`Add subpage to ${p.title}`} disabled={editing} onClick={() => { setParentId(p.id); setTitle(''); setAdding(true); }}>+</button>}
          {canCreate && <button type="button" className="doc-tree-delete" aria-label={`Delete page ${p.title}`} title={p.protected ? 'Unlock this page before deleting' : editing ? 'Finish editing before deleting' : 'Delete page'} disabled={editing || busy || p.protected} onClick={() => { setRemoving(p); setError(''); setAdding(false); }}><DocIcon name="trash" /></button>}
        </div>)}</nav>
        {!visible.length && <p className="docs-muted">{query ? 'No matching pages.' : 'No pages yet.'}</p>}
        {removing && <section className="doc-delete-confirm" role="group" aria-label="Confirm page deletion">
          <strong>Delete “{removing.title}”?</strong>
          <p>This moves the page to Archived pages, where you can restore it.</p>
          {pages.some(p => p.parentId === removing.id) && <p>Delete its subpages first.</p>}
          <div className="docs-actions"><button type="button" autoFocus disabled={busy} onClick={() => { setRemoving(null); setError(''); }}>Cancel</button><button type="button" className="doc-delete-action" disabled={busy || editing || pages.some(p => p.parentId === removing.id)} onClick={() => void removePage()}><DocIcon name="trash" />{busy ? 'Deleting…' : 'Delete page'}</button></div>
        </section>}
        {canCreate && <div className="doc-add-actions"><button type="button" disabled={editing || busy} onClick={() => void add(undefined, true)}><DocIcon name="plus" />{busy ? 'Adding…' : 'Add page'}</button><button type="button" disabled={editing || busy} aria-label="New page options" onClick={() => { setParentId(''); setTitle(''); setAdding(!adding); }} aria-expanded={adding}><DocIcon name="chevron" /></button></div>}
        {error && !adding && <p role="alert">{error}</p>}
        {canCreate&&!!archivedPages.length&&<details className="doc-archived"><summary>Archived pages ({archivedPages.length})</summary>{archivedPages.map(p=><div key={p.id}><span>{p.title}</span><button disabled={busy||editing} onClick={async()=>{setBusy(true);setError('');try{const res=await fetch(`/api/docs/${doc.id}/pages`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({pageId:p.id})});const body=await res.json();if(!res.ok)throw new Error(body.message);window.location.assign(`${base}/${body.slug}`);}catch(e){setError(e instanceof Error?e.message:'Restore failed.');}finally{setBusy(false);}}}><DocIcon name="history" />Restore</button></div>)}</details>}
      </aside>
      <div ref={reading} className={`doc-reading font-${readingStyle.font} size-${readingStyle.size} focus-${readingStyle.focus??'none'}${readingStyle.wide ? ' is-wide' : ''}`}>
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
          {error && <p role="alert">{error}</p>}<div className="docs-actions"><button className="docs-primary" disabled={busy}><DocIcon name="plus" />{busy ? 'Creating…' : 'Create page'}</button><button type="button" disabled={busy} onClick={() => setAdding(false)}><DocIcon name="close" />Cancel</button></div>
        </form>}
        {page ? <>
          {page.settings?.cover && <img className="doc-cover" alt="Page cover" src={String(page.settings.cover)} />}
          <div className="doc-reading-tools"><div className="doc-breadcrumb"><a href={`${base}?doc=${doc.id}`}>{doc.title}</a>{crumbs.map((p) => <span key={p.id}> / <a href={`${base}/${p.slug}`}>{p.title}</a></span>)}</div></div>
          {page.settings?.icon && <div className="doc-page-icon">{String(page.settings.icon)}</div>}
          {!editing && <><div className="doc-page-heading"><h1>{canEdit && !page.nodeId && !page.protected ? <button className="doc-title-button" title="Rename page" onClick={() => { setFocusTitle(true); setAdding(false); setEditing(true); }}>{pageTitle}</button> : pageTitle}</h1>{canEdit && !page.protected && <button className="docs-primary" onClick={() => { setFocusTitle(false); setAdding(false); setEditing(true); }}><DocIcon name="edit" />Edit page</button>}</div>{metadata}</>}

          {editing ? <PageEditor key={page.id} page={page} projectId={project.id} focusTitle={focusTitle} metadata={metadata} onTitleSaved={setPageTitle} onDone={() => { setEditing(false); window.history.replaceState(null, '', `${base}/${page.slug}`); router.refresh(); }} /> : <article className="doc-prose">{children}</article>}
          {page.settings?.showStats && <p className="docs-muted doc-page-stats">{pageMarkdown(page.template,page.content).length.toLocaleString()} characters · {Math.max(1,Math.ceil(pageMarkdown(page.template,page.content).length/1000))} min read</p>}
          {!editing && pages.some(p=>p.parentId===page.id) && <nav className="doc-subpages" aria-label="Subpages"><h2>Subpages</h2>{pages.filter(p=>p.parentId===page.id).map(p=><a key={p.id} href={`${base}/${p.slug}`}>▤ {p.title}</a>)}</nav>}
        </> : <div className="doc-overview"><h1>{doc.title}</h1><p className="docs-muted">{doc.version || 'No version stamp'} · {pages.length} pages</p>
          <p>{pages.length ? 'Choose a page to read its scope, decisions and reference material.' : canCreate ? 'Add the first page to start writing.' : 'A project admin can add the first page.'}</p></div>}
        </div>
      </div>
    </div>
  </main></div>;
}
