'use client';

import { useEffect, useRef } from 'react';
import type { LedgerRow } from '@/db/schema';

/**
 * Archiving asks first (D-4).
 *
 * A modal, deliberately. DESIGN.md refuses one for a task that needs *neither*
 * interruption nor protected focus — archiving a module that takes 59 tasks
 * with it needs both. An earlier version armed the row instead, which was
 * quieter and easier to trigger by accident on the way to somewhere else.
 *
 * It is a leaf laid over the page, not a card floating above it: page ground,
 * a 1px graphite rule, square corners, no blur and no shadow. The backdrop is
 * a flat wash of the board colour — the desk showing through — rather than the
 * usual dimming glass.
 *
 * The safe answer holds focus on open and Escape takes it, so the dangerous
 * one is never a stray Return away.
 */
export default function ConfirmArchive({
  node, descendants, onConfirm, onCancel,
}: {
  node: LedgerRow;
  descendants: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    keepRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key !== 'Tab') return;

      // Keep focus inside: behind this dialog is a grid where Delete archives.
      const focusable = boxRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const total = descendants + 1;

  return (
    <div className="sheetover" onMouseDown={onCancel}>
      <div
        className="overleaf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-archive-title"
        ref={boxRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-archive-title" className="label">Archive</h2>

        <p className="overleaf-name" lang={/[฀-๿]/.test(node.led_name) ? 'th' : 'en'}>
          {node.led_name}
        </p>

        <p className="overleaf-body">
          {descendants > 0 ? (
            <>
              This will archive <strong className="figure">{total}</strong> tasks — this one and the{' '}
              <strong className="figure">{descendants}</strong> beneath it.
            </>
          ) : (
            <>This task has nothing beneath it.</>
          )}
        </p>

        <p className="overleaf-note">
          Archived work leaves every view and stops counting towards progress and
          roll-up. It is not deleted, and you can undo this straight afterwards.
        </p>

        <div className="overleaf-actions">
          <button ref={keepRef} className="label" onClick={onCancel}>Keep it</button>
          <button className="label primary" onClick={onConfirm}>
            Archive {descendants > 0 ? `${total} tasks` : 'it'}
          </button>
        </div>
      </div>
    </div>
  );
}
