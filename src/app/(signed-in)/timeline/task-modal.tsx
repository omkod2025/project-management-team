'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskDetail } from '@/lib/task-detail';
import type { NodePatch } from '@/lib/nodes';
import { ImageLinks } from '../p/[slug]/image-field';

const dateFields = [
  ['estimateStart', 'led_estimate_start', 'Estimate start'],
  ['estimateEnd', 'led_estimate_end', 'Estimate end'],
  ['actualStart', 'led_actual_start', 'Actual start'],
  ['actualEnd', 'led_actual_end', 'Actual end'],
] as const;

export default function TaskModal({ nodeId, onClose, onSaved }: {
  nodeId: string; onClose: () => void; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [patch, setPatch] = useState<NodePatch>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement;
    el.showModal();
    return () => { el.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`/api/nodes/${nodeId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Could not load this task.');
        if (!controller.signal.aborted) setDetail(body);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load this task.'); });
    return () => controller.abort();
  }, [nodeId, attempt]);

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'The change did not save.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No connection. Try saving again.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  const setValue = (id: string, value: unknown) => setPatch((p) => ({ ...p, values: { ...p.values, [id]: value } }));
  const editable = detail && Object.values(detail.permissions).some(Boolean);

  return <dialog ref={dialog} className="rs-task-modal" aria-labelledby="rs-task-title"
    onCancel={(e) => { e.preventDefault(); if (!savingRef.current) onClose(); }}
    onKeyDown={(e) => e.stopPropagation()}>
    <div className="rs-task-head">
      <div><h2 id="rs-task-title">Task details</h2>{detail && <p>{detail.projectName}</p>}</div>
      <button type="button" disabled={saving} onClick={onClose} aria-label="Close task details">Close</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!detail ? error
      ? <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      : <p role="status">Loading task…</p>
      : <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {!editable && <p>You have read-only access to this project.</p>}
        <fieldset disabled={saving}>
          <label>Task name<input required value={patch.name ?? detail.row.led_name}
            disabled={!detail.permissions.rename} onChange={(e) => setPatch((p) => ({ ...p, name: e.target.value }))} /></label>
          <div className="rs-task-dates">{dateFields.map(([key, column, label]) => <label key={key}>{label}
            <input type="date" disabled={!detail.permissions.dates}
              value={(patch[key] !== undefined ? patch[key] : detail.row[column]) ?? ''}
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value || null }))} />
          </label>)}</div>
          {detail.fields.filter((f) => !f.archived).map((f) => {
            const value = patch.values && f.id in patch.values ? patch.values[f.id] : detail.row.led_custom_values[f.id];
            const disabled = !detail.permissions.values;
            if (f.kind === 'image') return <div key={f.id}><span>{f.name}</span><ImageLinks value={value} /></div>;
            if (f.kind === 'select') return <label key={f.id}>{f.name}<select disabled={disabled} aria-label={f.name}
              value={typeof value === 'string' ? value : ''} onChange={(e) => setValue(f.id, e.target.value || null)}>
              <option value="">None</option>
              {f.options.filter((o) => !o.archived || o.id === value).map((o) => <option key={o.id} value={o.id} disabled={o.archived}>{o.label}</option>)}
            </select></label>;
            if (f.kind === 'people' || f.kind === 'multi_select') {
              const selected = Array.isArray(value) ? value as string[] : [];
              const options = f.kind === 'people' ? detail.people.map((p) => ({ id: p.id, label: p.name, archived: false })) : f.options;
              return <fieldset key={f.id} disabled={disabled} className="rs-task-options"><legend>{f.name}</legend>
                {options.filter((o) => !o.archived || selected.includes(o.id)).map((o) => <label key={o.id}>
                  <input type="checkbox" checked={selected.includes(o.id)} disabled={o.archived}
                    onChange={(e) => setValue(f.id, e.target.checked ? [...selected, o.id] : selected.filter((id) => id !== o.id))} />{o.label}
                </label>)}
              </fieldset>;
            }
            if (f.kind === 'checkbox') return <label key={f.id} className="rs-task-check"><input type="checkbox" disabled={disabled}
              checked={value === true} onChange={(e) => setValue(f.id, e.target.checked)} />{f.name}</label>;
            if (f.kind === 'long_text') return <label key={f.id}>{f.name}<textarea disabled={disabled} rows={4}
              value={String(value ?? '')} onChange={(e) => setValue(f.id, e.target.value || null)} /></label>;
            const money = f.kind === 'money';
            const numeric = money || f.kind === 'number';
            const amount = money ? (value as { amount?: number } | null)?.amount : value;
            return <label key={f.id}>{f.name}{money ? ` (${f.settings.currency ?? 'THB'})` : ''}
              <input disabled={disabled} type={numeric ? 'number' : f.kind === 'date' ? 'date' : 'text'} step={numeric ? 'any' : undefined}
                value={String(amount ?? '')} onChange={(e) => setValue(f.id, e.target.value === '' ? null : money
                  ? { amount: Number(e.target.value), currency: f.settings.currency ?? 'THB' }
                  : numeric ? Number(e.target.value) : e.target.value)} />
            </label>;
          })}
        </fieldset>
        <div className="rs-task-actions"><button type="button" disabled={saving} onClick={onClose}>Cancel</button>
          {editable && <button type="submit" disabled={saving || Object.keys(patch).length === 0 || (patch.name !== undefined && !patch.name.trim())}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>}
        </div>
      </form>}
  </dialog>;
}
