'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DocIcon from '../p/[slug]/docs/doc-icon';
import { exportPages, readImportFile, type ImportItem, type TransferPage } from '../p/[slug]/docs/doc-transfer';
import { pageMarkdown, type DocPage } from '@/lib/doc-rules';
import type { DocEndpoints } from '@/lib/doc-endpoints';
import { problem, wikiCall } from './wiki-api';

type Format = 'md' | 'json' | 'html' | 'print';

type Props = {
  wiki: { id: string; title: string };
  page?: DocPage;
  hasPages: boolean;
  canWrite: boolean;
  endpoints: DocEndpoints;
  disabled: boolean;
};

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** A wiki page has one body. A Docs Module page brought in from JSON keeps all its words in it. */
const bodyOf = (item: ImportItem) => (item.template === 'free' ? item.content.body ?? '' : pageMarkdown(item.template, item.content));

const asTransfer = (p: { id: string; title: string; body: string }): TransferPage =>
  ({ id: p.id, title: p.title, template: 'free', content: { body: p.body } });

function save(source: string, mime: string, name: string, format: Format) {
  if (format === 'print') {
    const frame = document.createElement('iframe');
    Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0' });
    frame.title = 'Print wiki';
    frame.onload = () => {
      frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true });
      frame.contentWindow?.print();
    };
    frame.srcdoc = source;
    document.body.append(frame);
    return;
  }
  const url = URL.createObjectURL(new Blob([source], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100)}.${format}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export this page or the whole wiki in every format Docs offers, and — for
 * writers — import a file as new pages. The conversion is Docs' own
 * (`doc-transfer.ts`); only where the pages come from and go to is the wiki's.
 */
export default function WikiTransfer({ wiki, page, hasPages, canWrite, endpoints, disabled }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<'page' | 'wiki'>(page ? 'page' : 'wiki');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function download(format: Format) {
    setBusy(true); setError(''); setNotice('');
    try {
      const pages = scope === 'page' && page
        ? [asTransfer({ id: page.id, title: page.title, body: page.content.body ?? '' })]
        : (await wikiCall<{ pages: { id: string; title: string; body: string }[] }>(`/api/wikis/${wiki.id}/pages`, 'GET')).pages.map(asTransfer);
      const title = scope === 'page' && page ? page.title : wiki.title;
      const { source, mime } = await exportPages(format, pages, title);
      save(source, mime, title, format);
      if (format !== 'print') setNotice('Export prepared. Check your browser downloads.');
    } catch (err) { setError(problem(err, 'Export failed. Try again.')); }
    finally { setBusy(false); }
  }

  async function importFile(file: File) {
    if (!file.size || file.size > MAX_IMPORT_BYTES) { setError('Choose a non-empty file up to 5 MB.'); return; }
    setBusy(true); setError(''); setNotice('');
    let created = 0;
    try {
      const { items, warnings } = await readImportFile(file, endpoints.uploadAsset);
      for (const item of items) {
        await wikiCall(`/api/wikis/${wiki.id}/pages`, 'POST', { title: item.title, body: bodyOf(item) });
        created++;
      }
      setNotice(`Imported ${created} page(s). Existing pages were not replaced.${warnings.length ? ' Conversion notes: ' + warnings.join(' ') : ''}`);
      router.refresh();
    } catch (err) {
      setError(`${problem(err, 'Import failed.')}${created ? ` ${created} page(s) already imported; do not import them again.` : ''}`);
    } finally { setBusy(false); }
  }

  return <details className="wiki-transfer">
    <summary><DocIcon name="download" />Export &amp; Import</summary>
    <div className="wiki-transfer-body">
      {hasPages && <>
        <label>Export scope<select value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'wiki')}>
          {page && <option value="page">This page</option>}
          <option value="wiki">Whole wiki</option>
        </select></label>
        <p className="docs-muted">Exports use saved content. Markdown omits colours and advanced layout; JSON preserves them.</p>
        <div className="wiki-transfer-row">
          <button type="button" disabled={busy || disabled} onClick={() => void download('md')}><DocIcon name="download" />Markdown</button>
          <button type="button" disabled={busy || disabled} onClick={() => void download('json')}><DocIcon name="download" />Fieldbook JSON</button>
          <button type="button" disabled={busy || disabled} onClick={() => void download('html')}><DocIcon name="download" />HTML</button>
          <button type="button" disabled={busy || disabled} onClick={() => void download('print')}><DocIcon name="print" />Print / Save as PDF</button>
        </div>
      </>}
      {canWrite && <>
        <h3>Import as new pages</h3>
        <p className="docs-muted">Word (.docx), Markdown, text, HTML or Fieldbook JSON. Existing pages are never replaced.</p>
        <input type="file" accept=".md,.markdown,.txt,.docx,.html,.htm,.json" disabled={busy || disabled} aria-label="Import document file"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
      </>}
      <p role="status" className="docs-notice">{notice}</p>
      {error && <p role="alert" className="docs-error">{error}</p>}
    </div>
  </details>;
}
