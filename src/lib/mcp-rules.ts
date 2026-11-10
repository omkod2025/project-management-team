/**
 * The List tools' rules over MCP, as pure functions.
 *
 * Same split as `token-rules.ts`: what an MCP caller may name and what its
 * arguments become are decisions, so they live where a test can reach them
 * without a database. `mcp/list-tools.ts` and `mcp/docs-tools.ts` are the
 * adapters that resolve ids against the tables and call the stores.
 */

import type { NodePatch } from './nodes.ts';
import { isUuid } from './token-rules.ts';
import { domainError } from './errors.ts';
import { mcpPageContent } from './wiki-mcp-content.ts';
import { removedDocAssetIds } from './doc-asset-references.ts';
import { pageSections, type PageContent, type PageTemplate } from './doc-rules.ts';
import {
  EMPTY, TICKED, UNTICKED, filterColumnsFrom, rowMatches,
  type FilterColumn, type FilterTerm, type FilterableField, type FilterableRow,
} from './list-filter.ts';

/**
 * The id as the token may use it: uuid-shaped, lowercased (a UUID is
 * case-insensitive; the scope and the database hold lowercase), and in
 * `ids`. Anything else is `null`, which the caller answers as "Not found." —
 * a malformed id and one outside scope are indistinguishable.
 */
export function scopedId(ids: readonly string[], raw: unknown): string | null {
  if (typeof raw !== 'string' || !isUuid(raw)) return null;
  const id = raw.toLowerCase();
  return ids.includes(id) ? id : null;
}

/** `update_task`'s field arguments, snake_case as they cross the wire. */
export type TaskArgs = {
  name?: string;
  estimate_start?: string | null;
  estimate_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  values?: Record<string, unknown>;
};

const PATCH_KEYS = [
  ['name', 'name'],
  ['estimate_start', 'estimateStart'],
  ['estimate_end', 'estimateEnd'],
  ['actual_start', 'actualStart'],
  ['actual_end', 'actualEnd'],
  ['values', 'values'],
] as const satisfies ReadonlyArray<readonly [keyof TaskArgs, keyof NodePatch]>;

/**
 * The node patch an `update_task` call asks for: only the keys present in
 * `args`, renamed snake → camel, values untouched. Nothing is derived — an
 * estimate never fills an actual nor the other way round (CLAUDE.md, "The
 * rule the product exists for"), so a key the caller left out stays out.
 */
export function taskPatch(args: TaskArgs): NodePatch {
  const patch: Record<string, unknown> = {};
  for (const [from, to] of PATCH_KEYS) {
    if (args[from] !== undefined) patch[to] = args[from];
  }
  return patch as NodePatch;
}

/** One value a column may hold, as `list_columns` names it. */
export type ColumnOption = { id: string; label: string; stage?: string | null; archived?: boolean };

/** One column of the List, as `list_columns` describes it. */
export type ListColumn = {
  /** The key a `list_tasks` row carries it under: a top-level key, or a key of `values`. */
  id: string;
  name: string;
  kind: string;
  /** `name` and the four dates are on every row; every other column is a custom field in `values`. */
  builtIn: boolean;
  /** The project's designated status column. */
  status?: true;
  /** The values a select, multi-select, people or module column may hold. */
  options?: ColumnOption[];
  /**
   * How `list_tasks` filters it: `values` (any of these ids), `contains`
   * (text, `%` = any run) or `range` (`from`/`to`, inclusive). Absent when the
   * column cannot be filtered — numbers, money, images, files.
   */
  filter?: 'values' | 'contains' | 'range';
};

const FILTER_BY_KIND: Record<string, ListColumn['filter']> = {
  text: 'contains', long_text: 'contains', date: 'range',
  select: 'values', multi_select: 'values', people: 'values', checkbox: 'values', module: 'values',
};

type ColumnField = {
  id: string;
  name: string;
  kind: string;
  position: number;
  archived: boolean;
  options: { id: string; label: string; stage: string | null; archived: boolean }[];
};

const BUILT_IN_COLUMNS: ListColumn[] = [
  { id: 'name', name: 'Name', kind: 'text', builtIn: true, filter: 'contains' },
  { id: 'estimateStart', name: 'Estimate start', kind: 'date', builtIn: true, filter: 'range' },
  { id: 'estimateEnd', name: 'Estimate end', kind: 'date', builtIn: true, filter: 'range' },
  { id: 'actualStart', name: 'Actual start', kind: 'date', builtIn: true, filter: 'range' },
  { id: 'actualEnd', name: 'Actual end', kind: 'date', builtIn: true, filter: 'range' },
];

/**
 * Every column of a project's List, with the values each choice column may
 * hold, so a caller can turn "tasks that are Doing and assigned to Ann" into
 * the ids `list_tasks` filters by. Archived fields are left out; archived
 * options are kept and say so, because rows filed under one still carry its
 * id. A people column's options are the project roster; the `module` column's
 * are the modules (depth-2 rows). Pure, no database.
 */
export function listColumns(
  fields: readonly ColumnField[],
  people: readonly { id: string; name: string }[],
  statusFieldId: string | null,
  modules: readonly { id: string; name: string }[] = [],
): ListColumn[] {
  const custom = fields
    .filter((f) => !f.archived)
    .sort((a, b) => a.position - b.position)
    .map((f): ListColumn => {
      const column: ListColumn = { id: f.id, name: f.name, kind: f.kind, builtIn: false };
      if (f.id === statusFieldId) column.status = true;
      if (f.kind === 'select' || f.kind === 'multi_select') {
        column.options = f.options.map((o) => ({
          id: o.id, label: o.label, stage: o.stage, ...(o.archived && { archived: true }),
        }));
      }
      if (f.kind === 'people') column.options = people.map((p) => ({ id: p.id, label: p.name }));
      const filter = FILTER_BY_KIND[f.kind];
      if (filter) column.filter = filter;
      return column;
    });
  const moduleColumn: ListColumn = {
    id: 'module', name: 'Module', kind: 'module', builtIn: true, filter: 'values',
    options: modules.map((m) => ({ id: m.id, label: m.name })),
  };
  return [...BUILT_IN_COLUMNS.map((c) => ({ ...c })), moduleColumn, ...custom];
}

/** One `filters` entry of a `list_tasks` call, as it crosses the wire. */
export type TaskFilter = {
  column: string;
  values?: (string | boolean | null)[];
  contains?: string;
  from?: string;
  to?: string;
};

/** A `list_tasks` column id → the key the shared filter rules know it by. */
const FILTER_KEY: Record<string, string> = {
  name: '_name',
  estimateStart: '_est_start',
  estimateEnd: '_est_end',
  actualStart: '_act_start',
  actualEnd: '_act_end',
  module: '_module',
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (message: string) => domainError('E_INVALID_DOC', message);

/**
 * The filter terms a `list_tasks` call asks for, in the List's own shape, so
 * the rows it returns are the rows the List would show for the same question
 * (`list-filter.ts`). The List quietly drops a term it cannot read, because
 * its terms are saved in a browser and outlive the schema; a caller over MCP
 * is told instead — an unknown column or option, the wrong kind of term for a
 * column, or a malformed date is an error, never a silently wider answer.
 */
export function taskFilterTerms(filters: readonly TaskFilter[], columns: readonly FilterColumn[]): FilterTerm[] {
  const seen = new Set<string>();
  return filters.map((f) => {
    const key = FILTER_KEY[f.column] ?? (isUuid(f.column) ? f.column.toLowerCase() : f.column);
    const column = columns.find((c) => c.key === key);
    if (!column) throw invalid(`Column "${f.column}" cannot be filtered. Use a column from list_columns that has a filter.`);
    if (seen.has(key)) throw invalid(`Column "${f.column}" is given twice. Put every value for it in one filter.`);
    seen.add(key);

    const given = (['values', 'contains', 'from', 'to'] as const).filter((k) => f[k] !== undefined);
    const only = (allowed: readonly string[], what: string) => {
      if (given.some((k) => !allowed.includes(k)) || given.length === 0) {
        throw invalid(`Column "${f.column}" (${column.label}) is filtered by ${what}.`);
      }
    };

    if (column.source === 'text') {
      only(['contains'], 'contains');
      if (!f.contains?.trim()) throw invalid(`contains for "${f.column}" is empty.`);
      return { key, values: [], text: f.contains };
    }

    if (column.source === 'date') {
      only(['from', 'to'], 'from and/or to (YYYY-MM-DD)');
      for (const day of [f.from, f.to]) {
        if (day !== undefined && !ISO_DAY.test(day)) throw invalid(`"${day}" is not a YYYY-MM-DD date.`);
      }
      return { key, values: [], ...(f.from && { from: f.from }), ...(f.to && { to: f.to }) };
    }

    only(['values'], 'values');
    if (!f.values?.length) throw invalid(`values for "${f.column}" is empty.`);
    const values = f.values.map((v) => {
      if (column.source === 'checkbox') {
        if (typeof v !== 'boolean') throw invalid(`A checkbox is filtered by true or false.`);
        return v ? TICKED : UNTICKED;
      }
      if (v === null) return EMPTY;
      if (typeof v !== 'string') throw invalid(`values for "${f.column}" are ids from list_columns, or null for empty.`);
      const id = isUuid(v) ? v.toLowerCase() : v;
      if (!column.choices.some((c) => c.id === id)) {
        throw invalid(`"${v}" is not an option of "${f.column}". Use an option id from list_columns.`);
      }
      return id;
    });
    return { key, values };
  });
}

/** Each row's module: its depth-2 ancestor, or itself at depth 2. */
export function modulesOf(
  rows: readonly { led_node_id: string; led_parent_id: string | null; led_depth: number }[],
): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.led_node_id, r]));
  const out = new Map<string, string>();
  for (const row of rows) {
    let at: typeof row | undefined = row;
    while (at && at.led_depth > 2) at = at.led_parent_id ? byId.get(at.led_parent_id) : undefined;
    if (at?.led_depth === 2) out.set(row.led_node_id, at.led_node_id);
  }
  return out;
}

type TaskRow = FilterableRow & { led_parent_id: string | null; led_depth: number; led_name: string };

/**
 * The tasks a `list_tasks` call returns: every row below the project root
 * (depth 2 and down), narrowed by `filters` when given. AND between filters,
 * OR among one filter's values — the List's reading exactly. Only the rows
 * that match come back; their `parentId` says where they sit.
 */
export function filterTasks<R extends TaskRow>(
  rows: readonly R[],
  ledger: {
    fields: readonly FilterableField[];
    people: readonly { id: string; name: string }[];
    statusFieldId: string | null;
  },
  filters: readonly TaskFilter[] | undefined,
): R[] {
  const tasks = rows.filter((r) => r.led_depth >= 2);
  if (!filters?.length) return tasks;
  const modules = tasks.filter((r) => r.led_depth === 2).map((r) => ({ id: r.led_node_id, name: r.led_name }));
  const columns = filterColumnsFrom([...ledger.fields], [...ledger.people], modules, ledger.statusFieldId);
  const terms = taskFilterTerms(filters, columns);
  const moduleOf = modulesOf(rows);
  return tasks.filter((r) => rowMatches(r, terms, columns, moduleOf));
}

/**
 * The page content an `update_doc_page` call asks for: one section replaced,
 * every other section exactly as it was. `section` defaults to `body` (a Free
 * page's only one) and must belong to the template. Rich content survives a
 * Markdown edit that leaves its Markdown unchanged and refuses one that does
 * not (`mcpPageContent`). An MCP edit may never drop a file link: removing a
 * file stays a deliberate act in the app, where the editor sees what goes.
 */
export function docPageContent(
  current: PageContent,
  template: PageTemplate,
  input: { section?: string; markdown?: string; rich_content?: string },
): PageContent {
  const section = input.section ?? 'body';
  if (!pageSections(template).some(([key]) => key === section)) {
    throw domainError('E_INVALID_DOC', 'This section does not belong to the page template.');
  }
  const next = { ...current, [section]: mcpPageContent(current[section] ?? '', input) };
  if (removedDocAssetIds(current, next).length > 0) {
    throw domainError('E_INVALID_DOC', 'This edit would remove a file from the page. Keep every file link, or remove files in the app.');
  }
  return next;
}
