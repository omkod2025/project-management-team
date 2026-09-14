'use client';

import { MAX_FILE_FIELD_BYTES } from '@/lib/upload-limits';
import { useEffect, useRef, useState } from 'react';
import type { FileValue } from '@/lib/node-rules';
import './file-field.css';

const ASSET_URL = /^\/api\/doc-assets\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Read a stored cell defensively: a value written before this column existed is not ours. */
export const files = (value: unknown): FileValue[] => Array.isArray(value)
  ? value.filter((v): v is FileValue => !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof (v as FileValue).url === 'string' && ASSET_URL.test((v as FileValue).url)
    && typeof (v as FileValue).name === 'string' && typeof (v as FileValue).bytes === 'number')
  : [];

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileLinks({ value }: { value: unknown }) {
  return <span className="file-links">{files(value).map((f) => (
    // `download` names the saved copy; the asset route also sends it as an attachment.
    <a key={f.url} href={f.url} download={f.name} onClick={(e) => e.stopPropagation()} title={`${f.name} · ${fileSize(f.bytes)}`}>
      {f.name}
    </a>
  ))}</span>;
}

export function FileField({ nodeId, fieldId, label, value, editing, canEdit, onCommit, onCancel }: {
  nodeId: string; fieldId: string; label: string; value: unknown; editing: boolean; canEdit: boolean;
  onCommit: (value: FileValue[]) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => files(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(files(value)); setError(''); root.current?.focus(); } }, [editing, value]);

  async function upload(chosen: File[]) {
    if (lock.current || !canEdit || !chosen.length) return;
    if (draft.length + chosen.length > 20) { setError('Attach up to 20 files per cell.'); return; }
    if (chosen.some((f) => !f.size || f.size > MAX_FILE_FIELD_BYTES)) { setError('Choose files up to 20 MB each.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      for (const file of chosen) {
        const form = new FormData(); form.set('file', file); form.set('fieldId', fieldId);
        const response = await fetch(`/api/nodes/${nodeId}/files`, { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Upload failed. Try again.');
        setDraft((current) => [...current, { url: result.url, name: result.filename, bytes: result.bytes }]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  if (!editing || !canEdit) return files(value).length ? <FileLinks value={value} /> : <span className="empty">—</span>;
  return <div ref={root} tabIndex={0} className="file-editor" role="group" aria-label={`${label} files`}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' && !busy) onCancel(); }}
    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onDrop={(e) => {
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length) { e.preventDefault(); e.stopPropagation(); void upload(dropped); }
    }}
    onPaste={(e) => {
      const pasted = Array.from(e.clipboardData.files);
      if (pasted.length) { e.preventDefault(); e.stopPropagation(); void upload(pasted); }
    }}>
    <p>Browse files, drop them here, or paste (Ctrl+V / ⌘V).</p>
    <small>Up to 20 files · 20 MB each. Any format; every file is stored as a download.</small>
    <div className="file-draft">{draft.map((f) => <div key={f.url}>
      <a href={f.url} download={f.name}>{f.name}</a>
      <span>{fileSize(f.bytes)}</span>
      <button type="button" disabled={busy} aria-label={`Remove ${f.name}`} onClick={() => setDraft((current) => current.filter((v) => v.url !== f.url))}>Remove</button>
    </div>)}</div>
    <input ref={input} type="file" hidden multiple onChange={(e) => {
      void upload(Array.from(e.target.files || [])); e.target.value = '';
    }} />
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Uploading…</p>}
    <div className="file-actions">
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>Browse files</button>
      <button type="button" disabled={busy} onClick={() => onCommit(draft)}>Save</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
