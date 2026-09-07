/**
 * The domain rules, as pure functions.
 *
 * Deliberately free of the database, of `server-only`, and of anything else
 * that would make them awkward to test. `nodes.ts` is the adapter that loads a
 * row, calls these, and writes the result back; everything that *decides*
 * lives here, where a test can reach it without a connection.
 *
 * The rule these exist to protect above all: a write to an estimate never
 * touches an actual, and a write to an actual never touches an estimate (D-10).
 */

import { DomainError, domainError } from './errors.ts';
import { MAX_DEPTH, isReservedKey } from './constants.ts';

export type DateSource = 'auto' | 'manual';
export type Stage = 'notStarted' | 'inProgress' | 'done' | null;
export type FieldKind =
  | 'text' | 'long_text' | 'number' | 'money' | 'date'
  | 'select' | 'multi_select' | 'checkbox' | 'people';

export type NodeDates = {
  estimateStart: string | null;
  estimateEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  actualSourceStart: DateSource | null;
  actualSourceEnd: DateSource | null;
};

export type DatePatch = {
  estimateStart?: string | null;
  estimateEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
};

/**
 * What to persist. Actual dates are expressed as *raw* values: the database
 * snaps them forward to a working day (D-15) so the holiday calendar stays the
 * single source of truth, and the unsnapped value is kept beside the result.
 */
export type DateWrite = {
  estimateStart?: string | null;
  estimateEnd?: string | null;
  actualStartRaw?: string | null;
  actualEndRaw?: string | null;
  actualSourceStart?: DateSource | null;
  actualSourceEnd?: DateSource | null;
};

/* ------------------------------------------------------------------ dates */

/**
 * D-10, D-11, D-14, D-17.
 *
 * Estimates are stored exactly as given and are never snapped. Any hand edit
 * of an actual is `manual` by definition, and clearing one clears its source
 * too, so a later automatic capture is free to fill it again.
 */
export function planDateWrite(current: NodeDates, patch: DatePatch): DateWrite {
  const write: DateWrite = {};

  const touchesEstimate = patch.estimateStart !== undefined || patch.estimateEnd !== undefined;
  if (touchesEstimate) {
    const start = patch.estimateStart !== undefined ? patch.estimateStart : current.estimateStart;
    const end = patch.estimateEnd !== undefined ? patch.estimateEnd : current.estimateEnd;
    if (start && end && start > end) {
      throw domainError('E_RANGE_INVERTED', 'The start must not be after the end.');
    }
    if (patch.estimateStart !== undefined) write.estimateStart = patch.estimateStart;
    if (patch.estimateEnd !== undefined) write.estimateEnd = patch.estimateEnd;
  }

  const touchesActual = patch.actualStart !== undefined || patch.actualEnd !== undefined;
  if (touchesActual) {
    const start = patch.actualStart !== undefined ? patch.actualStart : current.actualStart;
    const end = patch.actualEnd !== undefined ? patch.actualEnd : current.actualEnd;
    // Checked before snapping. Snapping may still invert a range, and D-16
    // handles that afterwards by collapsing it rather than refusing it.
    if (start && end && start > end) {
      throw domainError('E_RANGE_INVERTED', 'The start must not be after the end.');
    }
    if (patch.actualStart !== undefined) {
      write.actualStartRaw = patch.actualStart;
      write.actualSourceStart = patch.actualStart === null ? null : 'manual';
    }
    if (patch.actualEnd !== undefined) {
      write.actualEndRaw = patch.actualEnd;
      write.actualSourceEnd = patch.actualEnd === null ? null : 'manual';
    }
  }

  return write;
}

/**
 * D-13, D-14, D-34b — automatic actual capture on a status transition.
 *
 * Three guarantees, each of which has cost somebody a day of debugging in some
 * other product:
 *   - it only ever fills a NULL, so moving back and forth between statuses
 *     never rewrites a date that is already recorded;
 *   - it never touches a field a human has set, even if that field was later
 *     cleared to NULL;
 *   - a NULL stage does nothing at all, which is what makes *cancelled* safe.
 */
export function planAutoCapture(
  current: NodeDates,
  stage: Stage,
  today: string,
  pending: DateWrite = {},
): DateWrite {
  if (stage !== 'inProgress' && stage !== 'done') return pending;

  const write: DateWrite = { ...pending };

  const startAvailable =
    current.actualStart === null &&
    current.actualSourceStart !== 'manual' &&
    pending.actualStartRaw === undefined;

  const endAvailable =
    current.actualEnd === null &&
    current.actualSourceEnd !== 'manual' &&
    pending.actualEndRaw === undefined;

  if (startAvailable) {
    write.actualStartRaw = today;
    write.actualSourceStart = 'auto';
  }
  if (stage === 'done' && endAvailable) {
    write.actualEndRaw = today;
    write.actualSourceEnd = 'auto';
  }

  return write;
}

/** True when the write would modify a date on the opposite axis. The guard
 *  for D-10, used by the tests and cheap enough to assert in development. */
export function crossesAxes(write: DateWrite): boolean {
  const est = write.estimateStart !== undefined || write.estimateEnd !== undefined;
  const act =
    write.actualStartRaw !== undefined || write.actualEndRaw !== undefined ||
    write.actualSourceStart !== undefined || write.actualSourceEnd !== undefined;
  return est && act;
}

/* ------------------------------------------------------------------- tree */

/** D-1, D-2 — the depth a new child would take, or a refusal. */
export function childDepth(parentDepth: number): number {
  const depth = parentDepth + 1;
  if (depth > MAX_DEPTH) {
    throw domainError('E_MAX_DEPTH', `A subtask cannot go deeper than ${MAX_DEPTH} levels.`);
  }
  return depth;
}

/**
 * D-3 — where a node may be re-parented.
 *
 * A node may move under any other node in the project, taking its subtree with
 * it. Depth follows the new parent, and every descendant shifts by the same
 * amount. This is what makes indent and outdent possible.
 *
 * > **Amended 2026-09-07.** The rule originally forbade a depth change, which
 * > made promotion and demotion impossible: reorganising meant creating a node
 * > and moving children one at a time. The owner relaxed it after the import
 * > showed real work five levels deep, most of it below the level it was
 * > first filed at.
 * >
 * > The cost, stated so nobody rediscovers it as a surprise: **the names of
 * > depths 1–3 are now positions, not kinds.** A "module" is whatever sits at
 * > depth 2. Moving a task up makes it a module; moving a module down makes it
 * > a task. Nothing about the row changes except where it sits.
 *
 * The two things still refused are the ones that break the tree rather than
 * merely reshape it: exceeding the depth ceiling, and making a cycle
 * (`assertMoveTarget`).
 *
 * `subtreeHeight` is 0 for a leaf, 1 when it has children, and so on.
 */
export function planMove(
  nodeDepth: number,
  targetParentDepth: number,
  subtreeHeight: number,
): { newDepth: number; delta: number } {
  const newDepth = targetParentDepth + 1;

  if (newDepth + subtreeHeight > MAX_DEPTH) {
    throw domainError(
      'E_MAX_DEPTH',
      `That move would put a subtask deeper than ${MAX_DEPTH} levels.`,
      { deepest: newDepth + subtreeHeight },
    );
  }
  return { newDepth, delta: newDepth - nodeDepth };
}

/**
 * A node cannot be moved into its own subtree, and cannot be moved under
 * itself. Without this the tree becomes a cycle: the node disappears from
 * every view, the recursive roll-up never terminates, and the only way back is
 * a manual UPDATE. Cheap to check, catastrophic to miss.
 *
 * `targetAncestors` is the target's ancestor chain, nearest first.
 */
export function assertMoveTarget(
  nodeId: string,
  targetId: string,
  targetAncestors: string[],
): void {
  if (nodeId === targetId) {
    throw domainError('E_LEVEL_MISMATCH', 'A task cannot be moved under itself.');
  }
  if (targetAncestors.includes(nodeId)) {
    throw domainError('E_LEVEL_MISMATCH', 'A task cannot be moved into its own subtree.');
  }
}

/** D-4 — the project root is the tree; archiving it would archive everything. */
export function assertArchivable(depth: number): void {
  if (depth <= 1) {
    throw domainError('E_LEVEL_MISMATCH', 'The project itself cannot be archived from here.');
  }
}

/* ---------------------------------------------------------- field values */

export type FieldSpec = {
  id: string;
  kind: FieldKind;
  archived: boolean;
  currency?: string;
};

export type OptionSpec = { id: string; fieldId: string; archived: boolean };

/**
 * D-31 to D-34 — shape and check one custom value.
 *
 * Returns `null` to mean "clear this key". Throws rather than coercing
 * silently: a value that cannot be represented is a bug in the caller, and
 * storing something approximate would be worse than refusing.
 */
export function coerceValue(
  field: FieldSpec,
  raw: unknown,
  options: OptionSpec[] = [],
): unknown {
  if (field.archived) {
    throw domainError('E_UNKNOWN_FIELD', 'That column was archived.', { key: field.id });
  }
  if (raw === null || raw === undefined || raw === '') return null;

  const liveOption = (id: string) => {
    const opt = options.find((o) => o.id === id && o.fieldId === field.id);
    if (!opt) throw domainError('E_UNKNOWN_FIELD', 'No such option.', { id });
    if (opt.archived) {
      throw domainError('E_OPTION_ARCHIVED', 'That option was archived and cannot be chosen.', { id });
    }
    return opt.id;
  };

  switch (field.kind) {
    case 'select':
      return liveOption(String(raw));

    case 'multi_select': {
      if (!Array.isArray(raw)) throw domainError('E_UNKNOWN_FIELD', 'Expected a list of options.');
      return raw.map((v) => liveOption(String(v)));
    }

    case 'people': {
      if (!Array.isArray(raw)) throw domainError('E_UNKNOWN_FIELD', 'Expected a list of people.');
      return raw.map(String);
    }

    case 'checkbox':
      return raw === true || raw === 'true';

    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw domainError('E_UNKNOWN_FIELD', 'Expected a number.');
      return n;
    }

    case 'money': {
      const amount = typeof raw === 'object' && raw !== null && 'amount' in raw
        ? Number((raw as { amount: unknown }).amount)
        : Number(raw);
      if (!Number.isFinite(amount)) throw domainError('E_UNKNOWN_FIELD', 'Expected an amount.');
      return { amount, currency: field.currency ?? 'THB' };
    }

    case 'date': {
      const s = String(raw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw domainError('E_UNKNOWN_FIELD', 'Expected a date as YYYY-MM-DD.');
      }
      return s;
    }

    default:
      return String(raw);
  }
}

/** D-32 — underscore-prefixed keys belong to the system, never to a client. */
export function assertWritableKey(key: string): void {
  if (isReservedKey(key)) {
    throw domainError('E_RESERVED_KEY', 'That column is maintained by the system.', { key });
  }
}

export { DomainError };
