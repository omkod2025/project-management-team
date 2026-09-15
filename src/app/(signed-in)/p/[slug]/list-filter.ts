/**
 * Filtering, by any number of columns at once, and any number of values in each.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/list-filter.test.ts` can reach it — the same split as `list-sort.ts`
 * and `node-rules.ts`. The row and field types are structural rather than
 * imported for the same reason.
 *
 * **A filter is a set per column, and the sets are read differently across a
 * column than within one.** Within one column the values are alternatives —
 * "Doing *or* Blocked" is the question somebody triaging actually asks, and it
 * is the reason single-select filters were not enough. Across columns they
 * narrow — "Doing or Blocked, *and* assigned to Ann". That is OR inside, AND
 * between, which is the only reading of a multi-select filter row that anybody
 * has ever expected.
 *
 * **A column with no values chosen is not in the filter at all.** An empty set
 * means "everything", not "nothing": a half-opened menu must never blank the
 * page.
 *
 * Filtering is a property of the reading, like the sort — it belongs to this
 * reader on this machine, never to the project. It hides rows; it never writes
 * one.
 */

/** The value that stands for an empty cell. Not a real option id. */
export const EMPTY = '_none';

/** A checkbox has no options of its own, so it borrows these two. */
export const TICKED = '_ticked';
export const UNTICKED = '_unticked';

/** One value a column may be filtered to. */
export type FilterChoice = { id: string; label: string; archived?: boolean };

/**
 * What a column contributes to the filter.
 *
 * `source` says where a row's values are read from, not what the column is
 * called in the grid — `select` and `multi_select` both read a field, but one
 * holds an id and the other holds a list of them.
 */
export type FilterColumn = {
  key: string;
  label: string;
  source: 'select' | 'multi_select' | 'people' | 'checkbox' | 'module';
  /** The field the values are read from. Absent for `module`. */
  fieldId?: string;
  choices: FilterChoice[];
};

/** One column in the filter, and every value it is narrowed to. */
export type FilterTerm = { key: string; values: string[] };

export type FilterableRow = {
  led_node_id: string;
  led_custom_values: Record<string, unknown> | null;
};

/** What a row is, in one filterable column. Empty means the cell is empty. */
export function valuesOf(
  row: FilterableRow,
  column: FilterColumn,
  moduleOf?: ReadonlyMap<string, string>,
): string[] {
  if (column.source === 'module') {
    const id = moduleOf?.get(row.led_node_id);
    return id ? [id] : [];
  }

  const raw = column.fieldId ? row.led_custom_values?.[column.fieldId] ?? null : null;

  switch (column.source) {
    case 'select':
      return typeof raw === 'string' && raw ? [raw] : [];

    case 'multi_select':
    case 'people':
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && !!v) : [];

    /* A checkbox is never empty — it is ticked or it is not — so it answers
       with one of its two borrowed values rather than with nothing. Filtering
       a checkbox to "empty" would match no row at all, which reads as a bug. */
    case 'checkbox':
      return [raw === true ? TICKED : UNTICKED];

    default:
      return [];
  }
}

/** Does this row survive one column's set? */
export function matchesTerm(
  row: FilterableRow,
  term: FilterTerm,
  column: FilterColumn,
  moduleOf?: ReadonlyMap<string, string>,
): boolean {
  if (term.values.length === 0) return true;
  const mine = valuesOf(row, column, moduleOf);
  if (mine.length === 0) return term.values.includes(EMPTY);
  return mine.some((v) => term.values.includes(v));
}

/**
 * Does this row survive the whole filter?
 *
 * A term naming a column that is no longer there — an archived field, a
 * deleted option — is dropped rather than obeyed. The alternative is a page
 * filtered by something the reader can no longer see or clear, and the filter
 * outlives the schema because it is saved in this browser.
 */
export function rowMatches(
  row: FilterableRow,
  terms: FilterTerm[],
  columns: FilterColumn[],
  moduleOf?: ReadonlyMap<string, string>,
): boolean {
  for (const term of terms) {
    const column = columns.find((c) => c.key === term.key);
    if (!column) continue;
    if (!matchesTerm(row, term, column, moduleOf)) return false;
  }
  return true;
}

/** Terms that still name a column, with values that still name a choice. */
export function liveTerms(terms: FilterTerm[], columns: FilterColumn[]): FilterTerm[] {
  const out: FilterTerm[] = [];
  for (const term of terms) {
    const column = columns.find((c) => c.key === term.key);
    if (!column) continue;
    const allowed = new Set([EMPTY, ...column.choices.map((c) => c.id)]);
    const values = term.values.filter((v) => allowed.has(v));
    if (values.length) out.push({ key: term.key, values });
  }
  return out;
}

/** How many values are chosen across the whole filter — what the pip counts. */
export function filterCount(terms: FilterTerm[]): number {
  return terms.reduce((n, t) => n + t.values.length, 0);
}

/** Add or remove one value in one column, dropping the column when it empties. */
export function toggleValue(terms: FilterTerm[], key: string, value: string): FilterTerm[] {
  const at = terms.findIndex((t) => t.key === key);
  if (at === -1) return [...terms, { key, values: [value] }];

  const term = terms[at]!;
  const values = term.values.includes(value)
    ? term.values.filter((v) => v !== value)
    : [...term.values, value];

  const next = [...terms];
  if (values.length === 0) next.splice(at, 1);
  else next[at] = { key, values };
  return next;
}

/** Everything chosen in one column, cleared. */
export function clearColumn(terms: FilterTerm[], key: string): FilterTerm[] {
  return terms.filter((t) => t.key !== key);
}

/**
 * The columns a filter can be built from.
 *
 * Only the columns that are a **choice from a known set**: a status, a tag, a
 * person, a tick. Free text, dates, money and numbers are not offered — a set
 * of checkboxes is the wrong instrument for a range, and the search box
 * already covers text.
 *
 * Archived fields are dropped; archived *options* are kept and said to be
 * archived, because rows filed under one still exist and hiding the option
 * would make them unreachable.
 */
export type FilterableField = {
  id: string;
  name: string;
  kind: string;
  archived: boolean;
  options: { id: string; label: string; archived: boolean }[];
};

export function filterColumnsFrom(
  fields: FilterableField[],
  people: { id: string; name: string }[],
  modules: { id: string; name: string }[] = [],
  statusFieldId: string | null = null,
): FilterColumn[] {
  const out: FilterColumn[] = [];

  if (modules.length > 0) {
    out.push({
      key: '_module',
      label: 'Module',
      source: 'module',
      choices: modules.map((m) => ({ id: m.id, label: m.name })),
    });
  }

  /* The status column first among the fields, wherever it is filed. It is the
     column the filter exists for — see spec 03 — and a reader opening this
     menu is looking for it before anything else. */
  const live = fields.filter((f) => !f.archived);
  const ordered = statusFieldId
    ? [...live.filter((f) => f.id === statusFieldId), ...live.filter((f) => f.id !== statusFieldId)]
    : live;

  for (const f of ordered) {
    switch (f.kind) {
      case 'select':
      case 'multi_select':
        out.push({
          key: f.id,
          label: f.name,
          source: f.kind,
          fieldId: f.id,
          choices: f.options.map((o) => ({ id: o.id, label: o.label, archived: o.archived })),
        });
        break;

      case 'people':
        out.push({
          key: f.id,
          label: f.name,
          source: 'people',
          fieldId: f.id,
          choices: people.map((p) => ({ id: p.id, label: p.name })),
        });
        break;

      case 'checkbox':
        out.push({
          key: f.id,
          label: f.name,
          source: 'checkbox',
          fieldId: f.id,
          choices: [
            { id: TICKED, label: 'Ticked' },
            { id: UNTICKED, label: 'Not ticked' },
          ],
        });
        break;

      default:
        break;
    }
  }

  return out;
}

/** The label a column's chosen set shows in the toolbar and to a screen reader. */
export function describeTerm(term: FilterTerm, columns: FilterColumn[]): string {
  const column = columns.find((c) => c.key === term.key);
  if (!column) return term.key;
  const names = term.values.map(
    (v) => (v === EMPTY ? 'Empty' : column.choices.find((c) => c.id === v)?.label ?? v),
  );
  return `${column.label}: ${names.join(', ')}`;
}
