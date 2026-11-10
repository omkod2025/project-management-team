/**
 * Filtering, by any number of columns at once, and any number of values in each.
 *
 * Kept out of the component and free of any import that needs a bundler, so
 * `tests/list-filter.test.ts` can reach it — the same split as `list-sort.ts`
 * and `node-rules.ts`. The row and field types are structural rather than
 * imported for the same reason. It lives in `lib/` because two readers share
 * it: the List and Timeline in the browser, and `list_tasks` over MCP, which
 * filters with exactly these rules so a question asked either way gets the
 * same rows.
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
 * Two kinds of column are not a set. A **text** column (the name, a text
 * field) is narrowed by what its cell contains, SQL-`LIKE` style: case does
 * not matter, and `%` stands for any run of characters. A **date** column (the
 * four estimate/actual dates, a date field) is narrowed to a range, both ends
 * inclusive and either one optional. An empty cell never satisfies either —
 * "contains x" and "between these days" are both questions about a value.
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
  source: 'select' | 'multi_select' | 'people' | 'checkbox' | 'module' | 'text' | 'date';
  /** The field the values are read from. Absent for `module` and for a row column. */
  fieldId?: string;
  /** A text or date column that reads the row itself rather than a field. */
  rowKey?: RowKey;
  /** Empty for `text` and `date`: they are typed into, not chosen from. */
  choices: FilterChoice[];
};

/** The row's own columns a text or date filter may read. */
export type RowKey =
  | 'led_name'
  | 'led_estimate_start' | 'led_estimate_end'
  | 'led_actual_start' | 'led_actual_end';

/**
 * One column in the filter: every value it is narrowed to, or — for a text
 * column — what the cell must contain, or — for a date column — the range.
 * `values` stays on every term so terms saved before text and dates existed
 * still read.
 */
export type FilterTerm = { key: string; values: string[]; text?: string; from?: string; to?: string };

export type FilterableRow = {
  led_node_id: string;
  led_custom_values: Record<string, unknown> | null;
  led_name?: string;
  led_estimate_start?: string | null;
  led_estimate_end?: string | null;
  led_actual_start?: string | null;
  led_actual_end?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Is this column typed into (text, a date range) rather than ticked? */
export function isTyped(column: FilterColumn): boolean {
  return column.source === 'text' || column.source === 'date';
}

/** What a text or date column holds for this row, as a string, or null when empty. */
export function cellText(row: FilterableRow, column: FilterColumn): string | null {
  const raw = column.rowKey
    ? row[column.rowKey]
    : column.fieldId ? row.led_custom_values?.[column.fieldId] : undefined;
  if (typeof raw === 'string') return raw === '' ? null : raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

/**
 * SQL `LIKE`, as a person means it in a filter box: case-insensitive, `%`
 * for any run of characters, and unanchored — `abc` reads as `%abc%`, which
 * is what typing into a box has always meant. `_` is left literal; it is far
 * more often part of a name than a wildcard anybody intended.
 */
export function likeMatch(value: string | null, pattern: string): boolean {
  const parts = pattern.trim().toLocaleLowerCase().split('%').filter(Boolean);
  if (parts.length === 0) return true;
  if (value === null) return false;
  const hay = value.toLocaleLowerCase();
  let at = 0;
  for (const part of parts) {
    const found = hay.indexOf(part, at);
    if (found === -1) return false;
    at = found + part.length;
  }
  return true;
}

/**
 * Is this day inside the range? Both ends inclusive, either may be absent, and
 * ends given the wrong way round are read the right way round rather than
 * matching nothing. Compared as `yyyy-MM-dd` strings, which sort as days do —
 * no time zone is involved.
 */
export function inRange(value: string | null, from?: string, to?: string): boolean {
  const lo = from && ISO_DAY.test(from) ? from : undefined;
  const hi = to && ISO_DAY.test(to) ? to : undefined;
  if (!lo && !hi) return true;
  const day = value?.slice(0, 10);
  if (!day || !ISO_DAY.test(day)) return false;
  const [a, b] = lo && hi && lo > hi ? [hi, lo] : [lo, hi];
  return (!a || day >= a) && (!b || day <= b);
}

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
  if (column.source === 'text') return likeMatch(cellText(row, column), term.text ?? '');
  if (column.source === 'date') return inRange(cellText(row, column), term.from, term.to);
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
    if (column.source === 'text') {
      if (term.text?.trim()) out.push({ key: term.key, values: [], text: term.text });
      continue;
    }
    if (column.source === 'date') {
      const from = term.from && ISO_DAY.test(term.from) ? term.from : undefined;
      const to = term.to && ISO_DAY.test(term.to) ? term.to : undefined;
      if (from || to) out.push({ key: term.key, values: [], ...(from && { from }), ...(to && { to }) });
      continue;
    }
    const allowed = new Set([EMPTY, ...column.choices.map((c) => c.id)]);
    const values = term.values.filter((v) => allowed.has(v));
    if (values.length) out.push({ key: term.key, values });
  }
  return out;
}

/** How much one term asks for: each ticked value, a text, a range — one each. */
export function termCount(term: FilterTerm | undefined): number {
  if (!term) return 0;
  return term.values.length + (term.text?.trim() ? 1 : 0) + (term.from || term.to ? 1 : 0);
}

/** How many values are chosen across the whole filter — what the pip counts. */
export function filterCount(terms: FilterTerm[]): number {
  return terms.reduce((n, t) => n + termCount(t), 0);
}

/** Replace one column's term, or drop it when it asks for nothing. */
function putTerm(terms: FilterTerm[], term: FilterTerm, keep: boolean): FilterTerm[] {
  const rest = terms.filter((t) => t.key !== term.key);
  if (!keep) return rest;
  const at = terms.findIndex((t) => t.key === term.key);
  if (at === -1) return [...terms, term];
  const next = [...terms];
  next[at] = term;
  return next;
}

/**
 * Set what a text column must contain. The text is kept as typed — a trailing
 * space may still be mid-word — and only an empty box drops the column.
 */
export function setText(terms: FilterTerm[], key: string, text: string): FilterTerm[] {
  return putTerm(terms, { key, values: [], text }, text !== '');
}

/** Set one or both ends of a date range; clearing both drops the column. */
export function setRange(
  terms: FilterTerm[],
  key: string,
  from: string | null | undefined,
  to: string | null | undefined,
): FilterTerm[] {
  const term: FilterTerm = { key, values: [], ...(from && { from }), ...(to && { to }) };
  return putTerm(terms, term, Boolean(from || to));
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
 * The columns that are a **choice from a known set** — a status, a tag, a
 * person, a tick — offer their values as checkboxes. The name and text fields
 * offer a box to type into; the four estimate/actual dates and date fields
 * offer a range. Money and numbers are not offered: neither "contains" nor a
 * day range is the right question to ask of an amount.
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
  const status = live.find((f) => f.id === statusFieldId);
  const statusColumn = status && fieldColumn(status, people);
  if (statusColumn) out.push(statusColumn);

  /* Then the row's own columns — the name and the two pairs of dates every
     row has — and then the fields as filed. */
  out.push(...ROW_COLUMNS);

  for (const f of live) {
    if (f === status) continue;
    const column = fieldColumn(f, people);
    if (column) out.push(column);
  }

  return out;
}

/** The columns every row has, whatever fields the project defines. */
const ROW_COLUMNS: FilterColumn[] = [
  { key: '_name', label: 'Name', source: 'text', rowKey: 'led_name', choices: [] },
  { key: '_est_start', label: 'Estimate start', source: 'date', rowKey: 'led_estimate_start', choices: [] },
  { key: '_est_end', label: 'Estimate end', source: 'date', rowKey: 'led_estimate_end', choices: [] },
  { key: '_act_start', label: 'Actual start', source: 'date', rowKey: 'led_actual_start', choices: [] },
  { key: '_act_end', label: 'Actual end', source: 'date', rowKey: 'led_actual_end', choices: [] },
];

/** What one field contributes to the filter, or null when it is not filterable. */
function fieldColumn(f: FilterableField, people: { id: string; name: string }[]): FilterColumn | null {
  const base = { key: f.id, label: f.name, fieldId: f.id };
  switch (f.kind) {
    case 'select':
    case 'multi_select':
      return {
        ...base,
        source: f.kind,
        choices: f.options.map((o) => ({ id: o.id, label: o.label, archived: o.archived })),
      };

    case 'people':
      return { ...base, source: 'people', choices: people.map((p) => ({ id: p.id, label: p.name })) };

    case 'checkbox':
      return {
        ...base,
        source: 'checkbox',
        choices: [
          { id: TICKED, label: 'Ticked' },
          { id: UNTICKED, label: 'Not ticked' },
        ],
      };

    case 'text':
    case 'long_text':
      return { ...base, source: 'text', choices: [] };

    case 'date':
      return { ...base, source: 'date', choices: [] };

    default:
      return null;
  }
}

/** The label a column's chosen set shows in the toolbar and to a screen reader. */
export function describeTerm(term: FilterTerm, columns: FilterColumn[]): string {
  const column = columns.find((c) => c.key === term.key);
  if (!column) return term.key;
  if (column.source === 'text') return `${column.label} contains “${term.text?.trim() ?? ''}”`;
  if (column.source === 'date') {
    if (term.from && term.to) return `${column.label}: ${term.from} – ${term.to}`;
    return term.from ? `${column.label}: from ${term.from}` : `${column.label}: until ${term.to ?? ''}`;
  }
  const names = term.values.map(
    (v) => (v === EMPTY ? 'Empty' : column.choices.find((c) => c.id === v)?.label ?? v),
  );
  return `${column.label}: ${names.join(', ')}`;
}
