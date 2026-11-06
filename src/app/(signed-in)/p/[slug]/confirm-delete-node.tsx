'use client';

import type { LedgerRow } from '@/db/schema';
import ConfirmDelete from '../../confirm-delete';
import { useWorkKind } from './work-kind-context';

/**
 * Deleting a row asks first (D-4), and says how much goes with it: a module
 * takes every task beneath it.
 *
 * Underneath it is still the soft delete it always was — the rows leave every
 * view and stop counting towards progress and roll-up, and the Undo that
 * follows brings them back — so the note says so rather than frighten.
 */
export default function ConfirmDeleteNode({
  node, descendants, onConfirm, onCancel,
}: {
  node: LedgerRow;
  descendants: number;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const noun = useWorkKind() === 'defect' ? 'defect' : 'task';
  const total = descendants + 1;

  return (
    <ConfirmDelete
      title={`Delete ${noun}`}
      name={node.led_name}
      note="Deleted work leaves every view and stops counting towards progress and roll-up. You can undo this straight afterwards."
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        {descendants > 0 ? (
          <>
            This deletes <strong>{total}</strong> {noun}s — this one and the{' '}
            <strong>{descendants}</strong> beneath it.
          </>
        ) : (
          <>This {noun} has nothing beneath it.</>
        )}
      </p>
    </ConfirmDelete>
  );
}
