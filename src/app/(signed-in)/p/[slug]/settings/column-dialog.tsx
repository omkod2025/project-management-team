'use client';

import { useEffect, useRef, useState } from 'react';
import type { Settings } from '@/lib/admin';
import { STAGES } from '@/lib/admin-rules';
import { nextOptionColor, optionStyle } from '@/lib/option-colors';
import ConfirmDelete, { TrashIcon } from '../../../confirm-delete';
import KindIcon, { KIND_LABEL } from './kind-icon';

export type Field = Settings['fields'][number];
type Send = (url: string, method: string, body?: unknown) => Promise<unknown>;

const STAGE_LABEL = { notStarted: 'not started', inProgress: 'running', done: 'closed' } as const;

/**
 * Editing one column, in a native modal `<dialog>` — focus held inside,
 * Escape closes, the page behind goes inert with no hand-rolled trap.
 *
 * Every box saves on its own, exactly as the rows on the page used to: there
 * is no Save button to forget. A refusal shows here as well as on the page,
 * because the page is behind the backdrop where nobody can read it.
 *
 * The column's kind is shown, never offered: it cannot be changed (D-31).
 */
export default function ColumnDialog({
  f, isStatus, projectId, error, busy, send, onClose,
}: {
  f: Field;
  isStatus: boolean;
  projectId: string;
  error: string | null;
  busy: boolean;
  send: Send;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [label, setLabel] = useState('');
  // What is being asked about: an option's id, or the whole column.
  const [doomed, setDoomed] = useState<string | 'column' | null>(null);
  const doomedOption = f.options.find((o) => o.id === doomed);
  const hasOptions = f.kind === 'select' || f.kind === 'multi_select';

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    // Back to the row that opened it, if that row is still on the page.
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="column-dialog"
      aria-labelledby="column-dialog-head"
      aria-busy={busy}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="column-dialog-sheet">
        <header className="column-dialog-head">
          <KindIcon kind={f.kind} status={isStatus} />
          <h2 id="column-dialog-head">Edit column</h2>
          <button type="button" className="column-dialog-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {error && <div className="errata" role="alert">{error}</div>}

        <div className="column-dialog-body">
          <div className="column-dialog-grid">
            <label className="column-dialog-field">
              <span>Name</span>
              <input
                key={f.name}
                className="field-input"
                defaultValue={f.name}
                maxLength={120}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== f.name) void send(`/api/fields/${f.id}`, 'PATCH', { name: v });
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </label>
            <div className="column-dialog-field">
              <span>Type</span>
              <p className="column-dialog-fixed">
                {KIND_LABEL[f.kind]}
                {typeof f.settings.currency === 'string' && ` · ${f.settings.currency}`}
                <small>A column keeps the type it was created with.</small>
              </p>
            </div>
          </div>

          {f.kind === 'select' && (
            <div className="column-dialog-status">
              <p>
                {isStatus
                  ? 'This is the status column. Its stages set actual dates.'
                  : 'A single-select column can drive automatic actual dates.'}
              </p>
              <button
                type="button"
                className="label"
                onClick={() => void send(`/api/projects/${projectId}`, 'PATCH', {
                  statusFieldId: isStatus ? null : f.id,
                })}
              >
                {isStatus ? 'Stop using as status' : 'Make status column'}
              </button>
            </div>
          )}

          {hasOptions && (
            <section className="column-dialog-options" aria-labelledby="column-dialog-options-head">
              <h3 id="column-dialog-options-head">
                Options <span className="count">{f.options.filter((o) => !o.archived).length}</span>
              </h3>

              {f.options.map((o) => (
                <div className={`settings-row option${o.archived ? ' is-archived' : ''}`} key={o.id}>
                  <span className="swatch" style={optionStyle(o.colorIndex)} />
                  <input
                    key={o.label}
                    className="field-input name"
                    defaultValue={o.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== o.label) void send(`/api/options/${o.id}`, 'PATCH', { label: v });
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    aria-label="Option label"
                  />
                  {isStatus && (
                    <select
                      key={o.stage ?? ''}
                      className="field-input stage-select"
                      defaultValue={o.stage ?? ''}
                      onChange={(e) => void send(`/api/options/${o.id}`, 'PATCH', { stage: e.target.value })}
                      aria-label={`Stage for ${o.label}`}
                    >
                      <option value="">no stage</option>
                      {STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
                    </select>
                  )}
                  {o.archived ? (
                    <button
                      type="button"
                      className="label"
                      onClick={() => void send(`/api/options/${o.id}`, 'PATCH', { archived: false })}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="option-bin delete-control"
                      aria-label={`Delete option ${o.label}`}
                      title="Delete option"
                      onClick={() => setDoomed(o.id)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}

              <form
                className="settings-row add"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!label.trim()) return;
                  void send(`/api/fields/${f.id}/options`, 'POST', {
                    label,
                    colorIndex: nextOptionColor(f.options.length),
                  });
                  setLabel('');
                }}
              >
                <input
                  className="field-input name"
                  placeholder="New option"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  aria-label="New option label"
                />
                <button type="submit" className="label" disabled={!label.trim()}>Add option</button>
              </form>

              {isStatus && (
                <p className="aside">
                  The stage on each option is what sets actual dates: the first move into
                  <em> running </em> records a start, and <em> closed </em> records an end.
                  An option with no stage records nothing, which is what makes a
                  cancelled task safe.
                </p>
              )}
            </section>
          )}
        </div>

        <footer className="column-dialog-actions">
          <button
            type="button"
            className="label delete-control"
            onClick={() => setDoomed('column')}
          >
            <TrashIcon />Delete column…
          </button>
          <button type="button" className="label primary" onClick={onClose}>Done</button>
        </footer>
      </div>

      {doomedOption && (
        <ConfirmDelete
          title="Delete option"
          name={doomedOption.label}
          note="Tasks that already carry it keep it, and Restore beside it here brings it back."
          onCancel={() => setDoomed(null)}
          onConfirm={async () => {
            await send(`/api/options/${doomedOption.id}`, 'PATCH', { archived: true });
            setDoomed(null);
          }}
        >
          <p>It can no longer be chosen in <strong>{f.name}</strong>.</p>
        </ConfirmDelete>
      )}
      {doomed === 'column' && (
        <ConfirmDelete
          title="Delete column"
          name={f.name}
          note="This cannot be undone. Values already entered on tasks are left as they are, but no view shows them again."
          blocked={isStatus
            ? 'This is the status column. Stop using it as status above before deleting it.'
            : undefined}
          onCancel={() => setDoomed(null)}
          onConfirm={async () => {
            if (await send(`/api/fields/${f.id}`, 'DELETE') === null) throw new Error('The column was not deleted.');
            setDoomed(null);
          }}
        >
          <p>It leaves the List and every view, and its options go with it.</p>
        </ConfirmDelete>
      )}
    </dialog>
  );
}
