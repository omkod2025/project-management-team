/**
 * Where a dragged row lands.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/list-move.test.ts` can reach it — the same split as `list-sort.ts`.
 *
 * A drop is two questions, and the pointer answers both: **which row** it is
 * over, and **which third of that row**. The top third means before it, the
 * bottom third means after it, and the middle third means inside it. That is
 * the only vocabulary this needs to express every move the List offers — a
 * task becomes a subtask by landing in a row's middle, a subtask becomes a
 * task by landing between two tasks, and either crosses to another module by
 * being dropped over there instead of here.
 *
 * The result is always `{ parentId, afterId }`, which is exactly what the move
 * endpoint takes: no separate "indent" or "promote" operation exists, because
 * every one of them is a parent and a position.
 */

export type DropZone = 'before' | 'after' | 'into';

export type MovableRow = {
  led_node_id: string;
  led_parent_id: string | null;
  led_depth: number;
};

export type DropPlan =
  | { ok: true; parentId: string; afterId: string | null; zone: DropZone }
  | { ok: false; reason: string };

/**
 * Which third of the row the pointer is in.
 *
 * `canNest` is false at the depth ceiling: the middle third would offer a move
 * that D-1 refuses, and an offer that always fails is worse than no offer, so
 * the row splits in half instead and reads as purely "between".
 */
export function zoneFor(offsetY: number, height: number, canNest: boolean): DropZone {
  if (!canNest) return offsetY < height / 2 ? 'before' : 'after';
  if (offsetY < height / 3) return 'before';
  if (offsetY > (height * 2) / 3) return 'after';
  return 'into';
}

/**
 * Turn a drop into a move, or refuse it with a reason a person can act on.
 *
 * The refusals are the two that break the tree rather than reshape it — a row
 * into itself, and a row into its own subtree — plus the depth ceiling, which
 * is checked here as well as on the server so the answer arrives before the
 * drop rather than after it (D-1, D-3).
 *
 * `rowsInOrder` is the run as drawn, which is what makes "before this row"
 * mean what the eye saw: the sibling in front of a row is the one above it on
 * the page, not the one before it in some other ordering.
 */
export function planDrop(
  dragged: MovableRow,
  target: MovableRow,
  zone: DropZone,
  rowsInOrder: readonly MovableRow[],
  opts: { maxDepth: number; subtreeHeight: number; rootId: string | null },
): DropPlan {
  if (dragged.led_node_id === target.led_node_id) {
    return { ok: false, reason: 'A task cannot be moved into itself.' };
  }
  if (isAncestor(dragged.led_node_id, target, rowsInOrder)) {
    return { ok: false, reason: 'A task cannot be moved into its own subtree.' };
  }

  const parentId = zone === 'into' ? target.led_node_id : target.led_parent_id;
  if (!parentId) {
    // Only the project row has no parent, and it is not drawn — but a row
    // dropped beside a module must land under the project, not nowhere.
    return opts.rootId
      ? finish(dragged, opts.rootId, zone, target, rowsInOrder, opts)
      : { ok: false, reason: 'There is nowhere for it to go.' };
  }
  return finish(dragged, parentId, zone, target, rowsInOrder, opts);
}

function finish(
  dragged: MovableRow,
  parentId: string,
  zone: DropZone,
  target: MovableRow,
  rowsInOrder: readonly MovableRow[],
  opts: { maxDepth: number; subtreeHeight: number },
): DropPlan {
  const parentDepth = zone === 'into'
    ? target.led_depth
    : target.led_depth - 1;
  const newDepth = parentDepth + 1;

  if (newDepth + opts.subtreeHeight > opts.maxDepth) {
    return {
      ok: false,
      reason: opts.subtreeHeight
        ? `That would put a subtask deeper than ${opts.maxDepth} levels.`
        : `A subtask cannot go deeper than ${opts.maxDepth} levels.`,
    };
  }

  return { ok: true, parentId, afterId: afterFor(dragged, parentId, zone, target, rowsInOrder), zone };
}

/**
 * The sibling the row goes behind.
 *
 * `null` is the front of the run, and it is not the same as "no answer": a
 * row dropped above the first child of a module has to land *first*, and
 * leaving `afterId` out would append it to the end instead — the opposite
 * place.
 *
 * The row being dragged is skipped when looking for its new neighbour, so
 * nudging a row one place up does not rank it against where it already is.
 */
function afterFor(
  dragged: MovableRow,
  parentId: string,
  zone: DropZone,
  target: MovableRow,
  rowsInOrder: readonly MovableRow[],
): string | null {
  if (zone === 'into') return null;
  if (zone === 'after') return target.led_node_id;

  const siblings = rowsInOrder.filter(
    (r) => r.led_parent_id === parentId && r.led_node_id !== dragged.led_node_id,
  );
  const at = siblings.findIndex((r) => r.led_node_id === target.led_node_id);
  return at > 0 ? siblings[at - 1]!.led_node_id : null;
}

/** Is `id` an ancestor of `row`? Walks up by parent, which is all we have. */
function isAncestor(id: string, row: MovableRow, rows: readonly MovableRow[]): boolean {
  let parent = row.led_parent_id;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    if (parent === id) return true;
    seen.add(parent);
    parent = rows.find((r) => r.led_node_id === parent)?.led_parent_id ?? null;
  }
  return false;
}

/** How deep the dragged row's own subtree runs, for the ceiling check. */
export function subtreeHeightOf(row: MovableRow, rows: readonly MovableRow[]): number {
  const below = new Set<string>([row.led_node_id]);
  let deepest = row.led_depth;
  // Repeated until it settles rather than in one pass: the caller may hand
  // over rows in any order, and a single sweep would miss a grandchild that
  // happened to be listed before its parent.
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) {
      if (below.has(r.led_node_id)) continue;
      if (r.led_parent_id && below.has(r.led_parent_id)) {
        below.add(r.led_node_id);
        deepest = Math.max(deepest, r.led_depth);
        grew = true;
      }
    }
  }
  return deepest - row.led_depth;
}
