/**
 * List sorting, by any number of columns at once.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/list-sort.test.ts` can reach it — the same split as `timeline/sort.ts`
 * and `node-rules.ts`. The row and column types are structural rather than
 * imported for the same reason.
 *
 * **The List sorts siblings, and never flattens.** The Timeline made the
 * opposite choice, and the reason the two differ is what each view is for: a
 * timeline is a picture of time, so a run that restarts at every module is not
 * in date order. The List is the filed page — the indent, the bracket, the
 * module chip and the per-module add row all say where a task lives, and a
 * flat run would make every one of them a lie. So a sort here reorders each
 * parent's children among themselves and leaves the tree standing.
 *
 * More than one column may be in the sort at once. They apply in the order
 * they were added: the first that separates two rows decides them, and when
 * every term ties the filed order does — so the page is stable and a row does
 * not drift between two equal neighbours on every render.
 */

/** One column in the sort, and which way it runs. */
export type SortTerm = { key: string; descending: boolean };

/** What `list-view.tsx` builds its columns from, narrowed to what ranking needs. */
export type SortableColumn = {
  key: string;
  label: string;
  kind: 'name' | 'date' | 'computed' | 'closed' | 'misclosure' | 'gutter' | 'field';
  dateKey?: 'estimateStart' | 'estimateEnd' | 'actualStart' | 'actualEnd';
  field?: {
    id: string;
    kind: string;
    options: { id: string; label: string }[];
  };
};

export type SortableRow = {
  led_name: string;
  led_sort_order: number;
  led_estimate_start: string | null;
  led_estimate_end: string | null;
  led_actual_start: string | null;
  led_actual_end: string | null;
  led_estimate_workdays: number | null;
  led_actual_workdays: number | null;
  led_misclosure_end: number | null;
  led_out_of_closure: boolean;
  led_closed_count: number;
  led_descendant_count: number;
  led_custom_values: Record<string, unknown> | null;
};

/**
 * The order modules stand in, when nothing else has been asked for.
 *
 * **By name, not by filed position.** A module is a permanent division of the
 * project — six or eight of them, named once and then read hundreds of times —
 * and the only reason its filed position ever differed from alphabetical is
 * the accident of which one was created first. Tasks are the opposite: their
 * order inside a module is a decision somebody made, so it is left alone. This
 * is the one place in the run where the filed order is not the baseline.
 *
 * `Intl.Collator` rather than `<`, for two reasons that both show up here:
 * content is Thai (`th` first, `en` behind it), and `numeric` puts *Module 2*
 * before *Module 10* instead of after it, which is how anybody numbering
 * modules expects them to read.
 *
 * A tie falls back to the filed order so the run is still stable.
 */
const moduleCollator = new Intl.Collator(['th', 'en'], { numeric: true, sensitivity: 'base' });

export function compareModuleNames(a: SortableRow, b: SortableRow): number {
  return moduleCollator.compare(a.led_name, b.led_name) || a.led_sort_order - b.led_sort_order;
}

/** A gutter has nothing in it; everything else can be ranked. */
export function isSortable(column: SortableColumn): boolean {
  return column.kind !== 'gutter' && column.field?.kind !== 'image';
}

/**
 * What a row is ranked by in one column.
 *
 * `null` means "nothing to sort on", which is not the same as zero, as an
 * empty string or as an early date — see the comparator.
 */
export function rankOf(row: SortableRow, column: SortableColumn): string | number | null {
  switch (column.kind) {
    case 'name':
      return row.led_name.toLocaleLowerCase();

    case 'date':
      switch (column.dateKey) {
        case 'estimateStart': return row.led_estimate_start;
        case 'estimateEnd': return row.led_estimate_end;
        case 'actualStart': return row.led_actual_start;
        case 'actualEnd': return row.led_actual_end;
        default: return null;
      }

    case 'computed':
      return (column.key === 'est_d' ? row.led_estimate_workdays : row.led_actual_workdays) || null;

    /* Progress is a proportion, not a count: `3 / 4` is further along than
       `10 / 40`, and ranking by the numerator would say otherwise. A leaf has
       nothing to be further along in, so it ranks as nothing. */
    case 'closed':
      return row.led_descendant_count === 0
        ? null
        : row.led_closed_count / row.led_descendant_count;

    /* Out of closure is the worst thing a row can say about itself (D-16), so
       it sorts past every number rather than as one — there is no slip figure
       to compare, and putting it in the middle of the run would bury the one
       state vermilion exists to shout about. */
    case 'misclosure':
      return row.led_out_of_closure ? Number.POSITIVE_INFINITY : row.led_misclosure_end;

    case 'field':
      return rankField(row, column);

    default:
      return null;
  }
}

function rankField(row: SortableRow, column: SortableColumn): string | number | null {
  const f = column.field;
  if (!f) return null;
  const raw = row.led_custom_values?.[f.id] ?? null;
  if (raw === null || raw === undefined) return null;

  switch (f.kind) {
    /* By the option's filed position, not its label. The options of a status
       field are a sequence — not started, running, closed — and alphabetical
       order would scramble the one custom column that has a real order. */
    case 'select': {
      const at = f.options.findIndex((o) => o.id === raw);
      return at === -1 ? null : at;
    }

    /* A set has no single position, so it ranks by its lowest member: a row
       tagged with the first option sorts with the first option. */
    case 'multi_select': {
      const ids = Array.isArray(raw) ? raw : [];
      const positions = ids
        .map((id) => f.options.findIndex((o) => o.id === id))
        .filter((at) => at !== -1);
      return positions.length ? Math.min(...positions) : null;
    }

    /* People carry no order of their own, so they rank by how many are on the
       row and then, in the comparator's tie-break, by the filed order. Names
       are not used: the cell prints them in assignment order and sorting by
       the first one would rank a two-person row by an arbitrary half of it. */
    case 'people': {
      const ids = Array.isArray(raw) ? raw : [];
      return ids.length ? ids.length : null;
    }

    case 'money': {
      const amount = (raw as { amount?: unknown }).amount;
      return typeof amount === 'number' ? amount : null;
    }

    case 'number':
      return typeof raw === 'number' ? raw : null;

    case 'checkbox':
      return raw === true ? 1 : 0;

    case 'date':
      return typeof raw === 'string' && raw ? raw : null;

    default: {
      const s = String(raw);
      return s ? s.toLocaleLowerCase() : null;
    }
  }
}

/**
 * A comparator for siblings, over any number of columns.
 *
 * Two behaviours that are decisions rather than details, both carried over
 * from the Timeline because a reader moving between the views must not have to
 * learn them twice:
 *
 *   - **A row with nothing to sort on goes last whichever way the term runs.**
 *     Reversing it would put every undated task at the top of a page ordered
 *     by date, and "no date" is not "earliest".
 *   - **Ties fall back to the filed order**, which is also what an empty sort
 *     returns.
 */
export function makeComparator(terms: SortTerm[], columns: SortableColumn[]) {
  const resolved = terms
    .map((t) => ({ term: t, column: columns.find((c) => c.key === t.key) }))
    .filter((r): r is { term: SortTerm; column: SortableColumn } =>
      !!r.column && isSortable(r.column));

  return (a: SortableRow, b: SortableRow): number => {
    for (const { term, column } of resolved) {
      const x = rankOf(a, column);
      const y = rankOf(b, column);

      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;

      const cmp = typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y)
        : x < y ? -1 : x > y ? 1 : 0;
      if (cmp !== 0) return term.descending ? -cmp : cmp;
    }
    return a.led_sort_order - b.led_sort_order;
  };
}

/** The label a term shows, and what a screen reader hears for it. */
export function describeTerm(term: SortTerm, columns: SortableColumn[]): string {
  const column = columns.find((c) => c.key === term.key);
  const label = column?.label || column?.key || term.key;
  return `${label} ${term.descending ? 'descending' : 'ascending'}`;
}
