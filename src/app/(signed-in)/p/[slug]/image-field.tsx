'use client';

import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { useEffect, useRef, useState } from 'react';
import { IMAGE_EXTENSIONS, isImageFile } from '@/lib/image-files';
import './image-field.css';

const urls = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && /^\/api\/doc-assets\/[0-9a-f-]{36}$/i.test(v)) : [];

function ImageLink({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  return <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Open image ${index + 1}`}>
    {failed ? <span>Download image {index + 1}</span> : <img src={url} alt={`Image ${index + 1}`} onError={() => setFailed(true)} />}
  </a>;
}

export function ImageLinks({ value }: { value: unknown }) {
  return <span className="image-links">{urls(value).map((url, i) => <ImageLink key={url} url={url} index={i} />)}</span>;
}

export function ImageField({ nodeId, fieldId, label, value, editing, canEdit, onCommit, onCancel }: {
  nodeId: string; fieldId: string; label: string; value: unknown; editing: boolean; canEdit: boolean;
  onCommit: (value: string[]) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => urls(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(urls(value)); setError(''); root.current?.focus(); } }, [editing, value]);

  async function upload(files: File[]) {
    if (lock.current || !canEdit || !files.length) return;
    if (draft.length + files.length > 20) { setError('Attach up to 20 images per cell.'); return; }
    if (files.some((f) => !isImageFile(f) || !f.size || f.size > MAX_UPLOAD_BYTES)) {
      setError('Choose image files up to 50 MB each.'); return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      for (const file of files) {
        const form = new FormData(); form.set('file', file); form.set('fieldId', fieldId);
        const response = await fetch(`/api/nodes/${nodeId}/images`, { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Upload failed. Try again.');
        setDraft((current) => [...current, result.url]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  if (!editing || !canEdit) return urls(value).length ? <ImageLinks value={value} /> : <span className="empty">—</span>;
  return <div ref={root} tabIndex={0} className="image-editor" role="group" aria-label={`${label} images`}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' && !busy) onCancel(); }}
    onPaste={(e) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length) { e.preventDefault(); e.stopPropagation(); void upload(files); }
    }}>
    <p>Browse images or paste here (Ctrl+V / ⌘V).</p>
    <small>Up to 20 images · 50 MB each. Some formats are download only.</small>
    <div className="image-draft">{draft.map((url, i) => <div key={url}>
      <ImageLink url={url} index={i} />
      <button type="button" disabled={busy} aria-label={`Remove image ${i + 1}`} onClick={() => setDraft((current) => current.filter((v) => v !== url))}>Remove</button>
    </div>)}</div>
    <input ref={input} type="file" hidden multiple accept={`image/*,${IMAGE_EXTENSIONS}`} onChange={(e) => {
      void upload(Array.from(e.target.files || [])); e.target.value = '';
    }} />
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Uploading…</p>}
    <div className="image-actions">
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>Browse images</button>
      <button type="button" disabled={busy} onClick={() => onCommit(draft)}>Save</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
