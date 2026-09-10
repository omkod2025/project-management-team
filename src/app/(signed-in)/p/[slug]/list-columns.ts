/**
 * Moving the List's columns.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/list-columns.test.ts` can reach it — the same split as `list-sort.ts`.
 *
 * **What moves is a block, not a column.** Six of the grid's columns belong to
 * bands — Estimate is `Start · End · Days`, Actual is the same three, then
 * Slip and Closed — and the band above the heads is the only thing on the page
 * that says which half is the plan and which is the record (spec 03 §2). Let a
 * reader drag `Actual end` into the middle of Estimate and that sentence stops
 * being true: the band would either span a lie or fragment into captions over
 * single columns, which is a second header row. So a band travels whole, with
 * its own leading gutter, and arrives somewhere else still saying the same
 * thing.
 *
 * Everything that is not in a band — Status and each custom field — is its own
 * block and moves alone. The name column is pinned first and is not a block at
 * all: it is sticky to the left edge, and a column that scrolled past it could
 * not pin to the same edge.
 */

/** Just enough of the view's `Column` to arrange them. */
export type ArrangeableColumn = {
  key: string;
  label: string;
  kind: 'name' | 'date' | 'computed' | 'closed' | 'misclosure' | 'gutter' | 'field';
  group?: 'estimate' | 'actual' | 'variance' | 'progress';
};

export type ColumnBlock<T extends ArrangeableColumn> = {
  /** Stable across sessions: a band's name, or the field's id. */
  key: string;
  label: string;
  /** True for the name column, which never moves and never merges. */
  pinned: boolean;
  columns: T[];
};

/**
 * Cut the grid into the pieces a reader may pick up.
 *
 * A gutter is a seam *before* a band rather than a column in its own right, so
 * it is swallowed into the block that follows it. That is what makes a moved
 * band arrive with its seam intact instead of leaving it behind next to
 * whatever used to follow.
 */
export function blocksOf<T extends ArrangeableColumn>(columns: T[]): ColumnBlock<T>[] {
  const blocks: ColumnBlock<T>[] = [];
  let pendingGutters: T[] = [];

  for (const column of columns) {
    if (column.kind === 'gutter') {
      pendingGutters.push(column);
      continue;
    }

    const last = blocks[blocks.length - 1];
    // A band continues only while the columns are adjacent and no seam has
    // opened between them — the same test the header band itself applies.
    if (column.group && last && last.key === column.group && !pendingGutters.length) {
      last.columns.push(column);
      continue;
    }

    blocks.push({
      key: column.group ?? column.key,
      label: column.group ? bandLabel(column.group) : column.label,
      pinned: column.kind === 'name',
      columns: [...pendingGutters, column],
    });
    pendingGutters = [];
  }

  // A trailing seam belongs to nothing; drop it rather than invent a block.
  return blocks;
}

const bandLabel = (group: NonNullable<ArrangeableColumn['group']>) =>
  ({ estimate: 'Estimate', actual: 'Actual', variance: 'Slip', progress: 'Closed' })[group];

/**
 * Put the blocks in the reader's saved order.
 *
 * Two rules keep a stored order from ever losing a column, which is the way an
 * arrangement feature normally goes wrong:
 *
 *   - **A key in the order that no longer exists is ignored**, so archiving a
 *     field does not leave a hole or throw.
 *   - **A block the order has never heard of keeps its natural place** rather
 *     than being dropped or flung to the end. Add a custom field a year after
 *     saving an arrangement and it appears where the project files it, next to
 *     its neighbour — not missing, which the reader would read as a bug in the
 *     field, and not last, which is where nobody is looking.
 *
 * The pinned block leads whatever the order says.
 */
export function arrangeBlocks<T extends ArrangeableColumn>(
  blocks: ColumnBlock<T>[],
  order: readonly string[],
): ColumnBlock<T>[] {
  const pinned = blocks.filter((b) => b.pinned);
  const movable = blocks.filter((b) => !b.pinned);
  const known = new Set(order);

  const placed = order
    .map((key) => movable.find((b) => b.key === key))
    .filter((b): b is ColumnBlock<T> => !!b);

  // Walk the natural order with a cursor: a block the order knows moves the
  // cursor to just after where it ended up, and a block it does not know is
  // dropped at the cursor — which is exactly "beside the neighbour it was
  // filed next to", and, when the order is empty, the filed order itself.
  const out = [...placed];
  let cursor = 0;
  for (const block of movable) {
    const at = out.findIndex((b) => b.key === block.key);
    if (at !== -1) {
      cursor = at + 1;
      continue;
    }
    if (known.has(block.key)) continue;
    out.splice(cursor, 0, block);
    cursor += 1;
  }

  return [...pinned, ...out];
}

/** The columns to draw, in the reader's order. */
export function arrangeColumns<T extends ArrangeableColumn>(
  columns: T[],
  order: readonly string[],
): T[] {
  return arrangeBlocks(blocksOf(columns), order).flatMap((b) => b.columns);
}

/**
 * Move one block, by one place or to a given index.
 *
 * Returns a complete order rather than a patch of one, so the saved value is
 * always the whole arrangement — a partial order would depend on a natural
 * order that a later release could change underneath it.
 */
export function moveBlock<T extends ArrangeableColumn>(
  blocks: ColumnBlock<T>[],
  order: readonly string[],
  key: string,
  to: number | 'left' | 'right',
): string[] {
  const current = arrangeBlocks(blocks, order)
    .filter((b) => !b.pinned)
    .map((b) => b.key);

  const at = current.indexOf(key);
  if (at === -1) return current;

  const target = to === 'left' ? at - 1 : to === 'right' ? at + 1 : to;
  if (target < 0 || target >= current.length || target === at) return current;

  const next = [...current];
  next.splice(at, 1);
  next.splice(target, 0, key);
  return next;
}
