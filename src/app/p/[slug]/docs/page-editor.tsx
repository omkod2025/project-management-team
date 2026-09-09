'use client';
import DocIcon from "./doc-icon";
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pageMarkdown, pageSections, type DocPage, type PageContent } from '@/lib/doc-rules';
import RichEditor from './rich-editor';

export default function PageEditor({ page, projectId, onDone, onTitleSaved, focusTitle = false, metadata, actionsContainer }: { page: DocPage; projectId: string; onDone: (saved: { content: PageContent; title: string; updatedAt: string }) => void; onTitleSaved: (title: string) => void; focusTitle?: boolean; metadata: React.ReactNode; actionsContainer: HTMLDivElement | null }) {
  const draft = useRef<PageContent>({ ...page.content });
  const titleDraft = useRef(page.title);
  const [title, setTitle] = useState(page.title);
  const snapshotDraft = () => JSON.stringify({ content: draft.current, ...(!page.nodeId ? { title: titleDraft.current } : {}) });
  const saved = useRef(snapshotDraft());
  const stamp = useRef(page.updatedAt);
  const flight = useRef<Promise<boolean> | null>(null);
  const stopped = useRef(false);
  const alive = useRef(true);
  const [change, setChange] = useState(0);
  const [status, setStatus] = useState('Saved');
  const [error, setError] = useState('');
  const errorPanel = useRef<HTMLDivElement>(null);
  const [conflict, setConflict] = useState(false);
  const [copy, setCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [restoreId,setRestoreId]=useState<string|null>(null);
  const [editorValues,setEditorValues]=useState(page.content);
  const [editorVersion,setEditorVersion]=useState(0);
  const pendingUploads = useRef(0);
  const uploadedAssets = useRef(new Set<string>());
  const finishing = useRef(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const cleanupPending = useRef(false);
  const forceRevision=useRef(false);
  const [history, setHistory] = useState<Array<{ id: string; content: PageContent; updatedAt: string; editor: string | null }> | null>(null);

  const save = useCallback(async (finalizeAssets = false): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (stopped.current) return false;
    if (!finalizeAssets && snapshotDraft() === saved.current) return true;
    if (!page.nodeId && !titleDraft.current.trim()) { setError('Enter a page title before saving. Your draft is still here.'); setStatus('Not saved'); return false; }
    const snapshot = snapshotDraft();
    setStatus('Saving…'); setError('');
    flight.current = (async () => {
      try {
        const response = await fetch(`/api/doc-pages/${page.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...JSON.parse(snapshot), updatedAt: stamp.current, forceRevision:forceRevision.current, finalizeAssets, uploadedAssets: [...uploadedAssets.current] }) });
        const body = await response.json();
        if (!response.ok) {
          stopped.current = true;
          if (alive.current) { setConflict(response.status === 409); setError(body.message ?? 'Save failed. Your draft is still here.'); setStatus('Not saved'); }
          return false;
        }
        saved.current = snapshot; stamp.current = body.updatedAt;
        cleanupPending.current = !!body.assetCleanupPending;
        if (alive.current && cleanupPending.current) setError('Document saved, but some removed files could not be deleted from storage. Click Done editing again to retry cleanup.');
        forceRevision.current=false;
        if (alive.current) { setStatus(snapshotDraft() === snapshot ? 'Saved' : 'Unsaved changes'); if (!page.nodeId) onTitleSaved(body.title); }
        return true;
      } catch {
        stopped.current = true;
        if (alive.current) { setError('Could not confirm the save. Copy your draft before reloading or retrying.'); setStatus('Not saved'); }
        return false;
      } finally {
        flight.current = null;
        if (alive.current) setChange((n) => n + 1);
      }
    })();
    return flight.current;
  }, [page.id, page.nodeId, onTitleSaved]);

  useEffect(() => {
    if (finishing.current || stopped.current || snapshotDraft() === saved.current) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [change, save]);

  useEffect(() => {
    alive.current = true;
    const warn = (e: BeforeUnloadEvent) => { if (pendingUploads.current || snapshotDraft() !== saved.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { alive.current = false; window.removeEventListener('beforeunload', warn); };
  }, []);

  async function done() {
    if (pendingUploads.current || finishing.current) return;
    finishing.current = true; setIsFinishing(true);
    let completed = false;
    try {
      // Finish any autosave first, then explicitly finalize even when the
      // document is already marked Saved. Freeze edits during this commit.
      if (flight.current && !await flight.current) return;
      if (!await save(true)) return;
      if (snapshotDraft() === saved.current && !cleanupPending.current) {
        const savedDraft = JSON.parse(saved.current);
        completed = true;
        onDone({ content: savedDraft.content, title: savedDraft.title ?? page.title, updatedAt: stamp.current });
      }
    } finally {
      finishing.current = false; if (alive.current) setIsFinishing(false);
      if (!completed) requestAnimationFrame(() => {
        errorPanel.current?.focus({ preventScroll: true });
        errorPanel.current?.scrollIntoView({ block: 'center' });
      });
    }
  }

  async function showHistory() {
    try {
      const res = await fetch(`/api/doc-pages/${page.id}/history`);
      if (!res.ok) throw new Error();
      setHistory(await res.json());
    } catch { setError('Could not load history. Try again.'); }
  }

  async function copyDraft() {
    try { await navigator.clipboard.writeText(pageMarkdown(page.template, draft.current)); setCopied(true); }
    catch { setCopy(true); }
  }
  function downloadDraft() {
    const source=JSON.stringify({format:'fieldbook-doc-v1',pages:[{title:titleDraft.current,template:page.template,content:draft.current}]},null,2);
    const url=URL.createObjectURL(new Blob([source],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fieldbook-draft.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  return <div className="page-editor" inert={isFinishing} aria-busy={isFinishing}>
    {actionsContainer && createPortal(<button className="docs-primary doc-done-button" type="button" disabled={uploads > 0 || isFinishing} aria-busy={isFinishing} onClick={() => void done()}><DocIcon name="check" />Done editing</button>, actionsContainer)}
    <div className="doc-page-heading">{page.nodeId ? <h1>{page.title}</h1> : <textarea className="doc-title-input" aria-label="Page title" value={title} maxLength={200} rows={1} autoFocus={focusTitle}
      onFocus={(e) => { if (title === 'Untitled') e.target.select(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); e.currentTarget.closest('.page-editor')?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(); } }}
      onChange={(e) => { const next = e.target.value.replace(/[\r\n]/g, ' '); titleDraft.current = next; setTitle(next); setStatus('Unsaved changes'); setChange((n) => n + 1); }} />}</div>
    {metadata}
    <div className="editor-savebar"><span role="status">{status}</span>
      <button type="button" onClick={() => void copyDraft()}><DocIcon name="copy" />{copied ? 'Copied Markdown' : 'Copy Markdown'}</button>
      <button type="button" onClick={() => history ? setHistory(null) : void showHistory()}><DocIcon name="history" />History</button>
    </div>
    {error && <div ref={errorPanel} tabIndex={-1} className="editor-error" role="alert"><p>{error}</p>
      <button type="button" onClick={downloadDraft}><DocIcon name="download" />Download complete draft (JSON)</button>
      {!conflict && <button type="button" onClick={() => { stopped.current = false; void save(); }}><DocIcon name="history" />Retry save</button>}
      {conflict && <button type="button" onClick={() => setCopy(true)}>Show my draft</button>}
    </div>}
    {copy && <label className="editor-copy">Your current draft — title and content; copy before reloading<textarea readOnly value={`# ${titleDraft.current}\n\n${pageMarkdown(page.template, draft.current)}`} onFocus={(e) => e.target.select()} /></label>}
    {history && <div className="editor-history"><div className="editor-history-heading"><h2>Page history</h2><button type="button" aria-label="Close history" onClick={() => setHistory(null)}><DocIcon name="close" /></button></div>{history.length ? history.map((r) => <details key={r.id}>
      <summary>{r.editor ?? 'Former member'} · {new Date(r.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })}</summary>
      <pre>{pageMarkdown(page.template, r.content)}</pre>
      {!conflict && <button type="button" disabled={uploads>0||status==='Saving…'} onClick={()=>setRestoreId(r.id)}><DocIcon name="history" />Restore this revision…</button>}
      {restoreId===r.id && <><p>Replace the current draft with this revision? It will be saved as a new edit.</p><button type="button" disabled={uploads>0||status==='Saving…'} onClick={()=>{if(flight.current)return;forceRevision.current=true;draft.current={...r.content};setEditorValues({...r.content});setEditorVersion(v=>v+1);setRestoreId(null);setHistory(null);setChange(v=>v+1);setStatus('Unsaved changes');}}><DocIcon name="history" />Confirm restore</button><button type="button" onClick={()=>setRestoreId(null)}><DocIcon name="close" />Cancel</button></>}
    </details>) : <p>No saved revisions yet.</p>}</div>}
    {pageSections(page.template).map(([key, label], index) => <section key={key} className="doc-section">
      {page.template === 'module' && <h2>{label}</h2>}
      <RichEditor key={`${key}-${editorVersion}`} value={editorValues[key] ?? ''} label={label} projectId={projectId} onProblem={setError} onAssetUploaded={url => uploadedAssets.current.add(url)} autoFocus={!focusTitle && index === 0}
        onUploadChange={(delta) => { pendingUploads.current += delta; setUploads(pendingUploads.current); }} onChange={(value) => {
        draft.current = { ...draft.current, [key]: value }; setCopied(false); setChange((n) => n + 1); setStatus('Unsaved changes');
      }} />
    </section>)}
  </div>;
}
