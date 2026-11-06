'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import './confirm-delete.css';

const THAI = /[฀-๿]/;

/** The bin every delete control draws: lid, handle, body, two staves. */
export function TrashIcon() {
  return (
    <svg className="trash-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}

type Props = {
  /** The dialog's name, e.g. "Delete task". */
  title: string;
  /** The thing being deleted, set apart so it is read before the button is. */
  name?: string;
  /** What goes with it. */
  children?: ReactNode;
  /** Whether it can come back, and from where. */
  note?: ReactNode;
  /** Why it cannot be deleted yet. Shown in place of going ahead; the button stays off. */
  blocked?: ReactNode;
  /** Resolve when done; the caller unmounts the dialog. A thrown Error is shown in place. */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
};

/**
 * Every delete asks first, in this one dialog — titled "Delete …" and
 * answered "Delete" on every page, whatever it is that goes.
 *
 * A modal, deliberately: a delete needs both the interruption and the
 * protected focus, and one shape everywhere means the question is recognised
 * rather than read past. The safe answer holds focus on open and Escape takes
 * it, so the destructive one is never a stray Return away. Danger red, never
 * vermilion — vermilion means out of closure and nothing else.
 *
 * Events stop at the dialog — it may be drawn inside a row, a menu or another
 * dialog, and behind it may be a grid where Delete deletes.
 */
export default function ConfirmDelete({
  title, name, children, note, blocked, onConfirm, onCancel,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const d = dialog.current;
    const returnTo = document.activeElement as HTMLElement | null;
    if (d && !d.open) d.showModal();
    keep.current?.focus();
    return () => { d?.close(); returnTo?.focus?.(); };
  }, []);

  function cancel() { if (!busy) onCancel(); }

  async function confirm() {
    if (busy || blocked) return;
    setBusy(true); setError('');
    try { await onConfirm(); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : 'Nothing was deleted. Try again.'); }
    finally { if (dialog.current?.isConnected) setBusy(false); }
  }

  return (
    <dialog
      ref={dialog}
      className="confirm-delete"
      aria-labelledby="confirm-delete-title"
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); cancel(); }}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) cancel(); }}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="confirm-delete-sheet">
        <header className="confirm-delete-head">
          <span className="confirm-delete-mark"><TrashIcon /></span>
          <h2 id="confirm-delete-title">{title}</h2>
        </header>

        {name && <p className="confirm-delete-name" lang={THAI.test(name) ? 'th' : undefined}>{name}</p>}
        {children && <div className="confirm-delete-body">{children}</div>}
        {blocked && <p className="confirm-delete-blocked" role="status">{blocked}</p>}
        {note && <p className="confirm-delete-note">{note}</p>}
        {error && <p className="confirm-delete-error" role="alert">{error}</p>}

        <footer className="confirm-delete-actions">
          <button ref={keep} type="button" disabled={busy} onClick={cancel}>Cancel</button>
          <button type="button" className="confirm-delete-go" disabled={busy || !!blocked} onClick={() => void confirm()}>
            <TrashIcon />{busy ? 'Deleting…' : 'Delete'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
