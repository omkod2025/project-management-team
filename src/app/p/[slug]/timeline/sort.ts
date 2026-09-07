/**
 * Timeline sorting.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/timeline-sort.test.ts` can reach it — the same split as
 * `node-rules.ts`. The row type is structural rather than imported for the
 * same reason.
 *
 * **Any sort other than `tree` flattens the project.** The first version
 * reordered siblings within their parent and kept the hierarchy, on the
 * argument that a module bracket only means something beside its own children.
 * In use that was simply wrong: a task due in March still sat below every task
 * of the module above it, so "sorted by date" did not produce a page in date
 * order, which is the only reason to ask for it.
 *
 * `tree` remains as the filed order, and is where the hierarchy lives.
 */

export type SortKey =
  | 'estimate' | 'tree' | 'estimateStart' | 'estimateEnd' | 'actualEnd' | 'misclosure' | 'name';

export const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'estimate',      label: 'Est date', hint: 'where the work sits in time — its start, or its end if it has no start' },
  { key: 'tree',          label: 'Order',    hint: 'the order the work is filed in' },
  { key: 'estimateStart', label: 'Starts',   hint: 'planned start only; an end-only task sorts last' },
  { key: 'estimateEnd',   label: 'Due',      hint: 'planned finish' },
  { key: 'actualEnd',     label: 'Finished', hint: 'recorded finish' },
  { key: 'misclosure',    label: 'Late by',  hint: 'working days past the estimate' },
  { key: 'name',          label: 'Name',     hint: 'alphabetical' },
];

/** The order a timeline opens in, unless this reader has chosen another. */
export const DEFAULT_SORT: SortKey = 'estimate';

export type SortableRow = {
  led_name: string;
  led_sort_order: number;
  led_estimate_start: string | null;
  led_estimate_end: string | null;
  led_actual_end: string | null;
  led_misclosure_end: number | null;
};

/**
 * What a row is ranked by. `null` means "nothing to sort on", which is not the
 * same as zero or as an early date.
 */
export function rankOf(row: SortableRow, sort: SortKey): string | number | null {
  switch (sort) {
    /**
     * Where the work sits in time, which is what a timeline is ordered by.
     *
     * A task may carry an end with no start (D-12) and draws as a milestone.
     * Ranking those by start alone would drop every milestone to the bottom
     * with the genuinely undated ones, so the end stands in for the start when
     * there is no start — the bar and the diamond then read left to right in
     * the order they actually occur.
     */
    case 'estimate':      return row.led_estimate_start ?? row.led_estimate_end;
    case 'estimateStart': return row.led_estimate_start;
    case 'estimateEnd':   return row.led_estimate_end;
    case 'actualEnd':     return row.led_actual_end;
    case 'misclosure':    return row.led_misclosure_end;
    case 'name':          return row.led_name.toLocaleLowerCase();
    default:              return null;
  }
}

/**
 * A comparator for siblings.
 *
 * Two behaviours that are decisions rather than details:
 *
 *   - **A row with nothing to sort on goes last whichever way the sort runs.**
 *     Reversing it would put every undated task at the top of a list ordered
 *     by date, and "no date" is not "earliest".
 *   - **Ties fall back to the filed order**, so the list is stable and a row
 *     does not jump around between two equal neighbours on every render.
 */
export function makeComparator(sort: SortKey, descending: boolean) {
  return (a: SortableRow, b: SortableRow): number => {
    if (sort === 'tree') return a.led_sort_order - b.led_sort_order;

    const x = rankOf(a, sort);
    const y = rankOf(b, sort);

    if (x === null && y === null) return a.led_sort_order - b.led_sort_order;
    if (x === null) return 1;
    if (y === null) return -1;

    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return (descending ? -cmp : cmp) || a.led_sort_order - b.led_sort_order;
  };
}

/**
 * The rows to draw, in order.
 *
 * `tree` walks the hierarchy, honouring collapse. Every other sort ignores the
 * hierarchy entirely and returns one flat run in the chosen order, because a
 * date-ordered page that restarts at every module is not date-ordered.
 *
 * The project root is never drawn in either mode: it is the page, not a row.
 */
export function orderRows<T extends SortableRow & { led_node_id: string; led_parent_id: string | null; led_depth: number }>(
  rows: T[],
  sort: SortKey,
  descending: boolean,
  opts: { rootId: string | null; collapsed: ReadonlySet<string> },
): T[] {
  if (sort !== 'tree') {
    return rows
      .filter((r) => r.led_depth > 1)
      .sort(makeComparator(sort, descending));
  }

  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const list = byParent.get(r.led_parent_id) ?? [];
    list.push(r);
    byParent.set(r.led_parent_id, list);
  }
  for (const l of byParent.values()) l.sort((a, b) => a.led_sort_order - b.led_sort_order);

  const out: T[] = [];
  const walk = (id: string | null) => {
    for (const r of byParent.get(id) ?? []) {
      out.push(r);
      if (!opts.collapsed.has(r.led_node_id)) walk(r.led_node_id);
    }
  };
  walk(opts.rootId);
  return out;
}
