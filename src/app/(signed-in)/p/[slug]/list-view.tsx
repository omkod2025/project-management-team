'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LedgerRow, MoneyValue } from '@/db/schema';
import type { FieldDef, Person } from '@/lib/ledger';
import { MAX_DEPTH } from '@/lib/constants';
import { ImageField } from './image-field';
import DetailPanel from './detail-panel';
import ProjectTitle from './project-title';
import ConfirmArchive from './confirm-archive';
import {
  loadSet, saveSet, loadRecord, saveRecord, selectedFromUrl, writeSelectedToUrl, siblingHref,
} from './view-state';
import {
  makeComparator, isSortable, compareModuleNames, type SortTerm, type SortableColumn,
} from './list-sort';
import { blocksOf, arrangeColumns, moveBlock } from './list-columns';
import {
  planDrop, zoneFor, subtreeHeightOf, type DropPlan, type DropZone,
} from './list-move';
import './list.css';
import Bell from '../../bell';

/**
 * The List view (spec 03).
 *
 * Hand-rolled rather than built on a table library. The grid is a tree with
 * fixed columns, bespoke editors and a very particular DOM — rules, brackets,
 * a punched hole instead of a row highlight — so a library's row model would
 * have been overhead without leverage.
 *
 * The design target is morning triage: twenty status changes, keyboard only,
 * no modal and no reload. `↓ ↓ Enter r Enter` changes a status; everything
 * else in the keyboard model exists to keep hands off the pointer.
 */

type Props = {
  projectId: string;
  projectName: string;
  slug: string;
  rows: LedgerRow[];
  fields: FieldDef[];
  people: Person[];
  statusFieldId: string | null;
  /** The project's column arrangement — one order, shared by everybody. */
  columnOrder: string[];
  canEdit: boolean;
  isAdmin: boolean;
  /** Rendered on the server: signing out is a server action. */
  signOut: React.ReactNode;
};

type Column = {
  key: string;
  label: string;
  width: number;
  align?: 'right';
  kind: 'name' | 'date' | 'computed' | 'closed' | 'misclosure' | 'gutter' | 'field';
  /** Which band this column sits under. Consecutive columns sharing a group
   *  are spanned by one label in the header's upper row. */
  group?: 'estimate' | 'actual' | 'variance' | 'progress';
  field?: FieldDef;
  dateKey?: 'estimateStart' | 'estimateEnd' | 'actualStart' | 'actualEnd';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TAB_HUE = (i: number) => `var(--color-tab-${((i - 1) % 6) + 1})`;

/** Read by the band above the heads and by each head's accessible name. */
const GROUP_NAMES: Record<'estimate' | 'actual' | 'variance' | 'progress', string> = {
  estimate: 'Estimate',
  actual: 'Actual',
  variance: 'Variance',
  /* Counted, never entered (D-24b) — and not a variance. It rode under the
     Variance band for one revision because it sat next to Slip, which is
     grouping by adjacency rather than by meaning: the exact habit the bands
     were added to break. */
  progress: 'Progress',
};
const isThai = (s: string) => /[฀-๿]/.test(s);

/** Dates are stored as dates, not timestamps, so there is nothing to convert. */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return `${iso.slice(8)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

export default function ListView({
  projectId, projectName, slug, rows: initialRows, fields, people, statusFieldId,
  columnOrder: savedColumnOrder, canEdit, isAdmin, signOut,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const [query, setQuery] = useState('');
  /** Columns the run is ordered by, first one first. Empty means filed order. */
  const [sortTerms, setSortTerms] = useState<SortTerm[]>([]);
  const [sortOpen, setSortOpen] = useState(false);
  /**
   * The column arrangement, as block keys. Empty means as filed.
   *
   * Unlike the sort and the expansion beside it, this one belongs to the
   * **project**: everybody opens the grid the same way round, and only an
   * Admin may change it. Held in state as well as in the props so a move lands
   * on the page at once rather than after the round trip — the server's answer
   * then confirms it, and a refusal puts the old order back.
   */
  const [columnOrder, setColumnOrder] = useState<string[]>(savedColumnOrder);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  /** The row in hand, and the row it is currently over. */
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; zone: DropZone; ok: boolean } | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<{ cell: string; message: string } | null>(null);
  const [pendingArchive, setPendingArchive] = useState<LedgerRow | null>(null);
  const [undo, setUndo] = useState<{ nodeId: string; name: string; count: number } | null>(null);
  const [ready, setReady] = useState(false);
  /* Read rather than written: the selection is still pushed into the URL with
     `history.replaceState`, which the router does not observe — so this only
     changes on a real navigation, which is exactly when arriving from the bell
     has to be noticed. */
  const search = useSearchParams();
  /** A row to bring into view as soon as it is drawn — see the effect below. */
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const chord = useRef<string | null>(null);

  /* ------------------------------------------------- restore view state */

  useEffect(() => {
    const stored = loadSet(slug, 'expanded');
    if (stored.size === 0) {
      // First visit: modules open, everything below closed (spec 03 §5).
      const s = new Set<string>();
      for (const r of initialRows) if (r.led_depth <= 2) s.add(r.led_node_id);
      setExpanded(s);
    } else {
      setExpanded(stored);
    }
    // The sort belongs to this reader on this machine, like the expansion —
    // not to the project. Somebody triaging by date must not reorder the page
    // for everyone else, and the filed order is what `led_sort_order` is for.
    setSortTerms(loadRecord<SortTerm[]>(slug, 'sort', []));
    const carried = selectedFromUrl();
    if (carried) setSelected(carried);
    setReady(true);
  }, [slug, initialRows]);

  /*
   * Arriving from the bell (spec 11 §7).
   *
   * `?node=` has always carried the selection between the List and the
   * Timeline, so a notification needs no parameter of its own. What it does
   * need is for the row to be *visible* when it gets here, and this reader's
   * saved state may well be hiding it: the module could be collapsed, and a
   * search typed an hour ago is still in the box.
   *
   * So the link wins over the saved view. It clears the search and opens every
   * ancestor — but it deliberately leaves the sort alone. A sort does not hide
   * a row, it only decides where the row sits, and silently rearranging the
   * page underneath somebody because they followed a link would be the larger
   * surprise.
   */
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    /*
     * From the router, not from `window.location`. Following a notification
     * into the project you are already looking at is a client-side navigation:
     * the component never remounts, so a one-shot read at mount — which is
     * what the first version of this did — left the row exactly as hidden as
     * it had been. Caught by clicking a real notification and finding the row
     * had not been rendered at all.
     */
    const target = search.get('node');
    if (!target || arrived.current === target) return;

    const row = rows.find((r) => r.led_node_id === target);
    if (!row) return;
    arrived.current = target;
    setSelected(target);

    setQuery('');
    setExpanded((open) => {
      const next = new Set(open);
      // Up the chain by parent, which is all a ledger row carries. The guard
      // is for a cycle that cannot happen through the API but would hang the
      // page if it ever did.
      const seen = new Set<string>();
      let parent = row.led_parent_id;
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        next.add(parent);
        parent = rows.find((r) => r.led_node_id === parent)?.led_parent_id ?? null;
      }
      return next;
    });

    // Scrolling is left to the effect further down, which waits for the row to
    // be drawn rather than guessing how long that takes.
    setPendingScroll(target);
  }, [ready, rows, search]);

  useEffect(() => { if (ready) saveSet(slug, 'expanded', expanded); }, [ready, slug, expanded]);
  useEffect(() => { if (ready) saveRecord(slug, 'sort', sortTerms); }, [ready, slug, sortTerms]);
  /* The project's own value is the truth. If somebody else moves a column and
     this page is refreshed, the server's order wins over what is in hand. */
  useEffect(() => { setColumnOrder(savedColumnOrder); }, [savedColumnOrder]);
  useEffect(() => { if (ready) writeSelectedToUrl(selected); }, [ready, selected]);

  /* ------------------------------------------------------------ columns */

  /** The grid as the project files it, before the reader rearranges anything. */
  const filedColumns = useMemo<Column[]>(() => {
    const live = fields.filter((f) => !f.archived).sort((a, b) => a.position - b.position);
    const status = live.find((f) => f.id === statusFieldId);
    const rest = live.filter((f) => f.id !== statusFieldId);

    return [
      /* 440px, not 320. Fixed layout means this number is now obeyed rather
         than overridden by the longest name in the project, so it has to be
         chosen: 440 is the widest the name can be while Status, both date
         groups, Slip and Closed all still land inside a 1,400px window — the
         set somebody triaging actually reads. Custom columns scroll. */
      { key: 'name', label: 'Name', width: 440, kind: 'name' },
      ...(status ? [{ key: status.id, label: status.name, width: 150, kind: 'field' as const, field: status }] : []),
      /*
       * The plan, then the record, then the verdict — each a closed group
       * behind its own seam.
       *
       * These six columns used to run as equal siblings in the order
       * est/est/act/act/est-d/act-d, which put each duration two columns from
       * the pair it measures and left nothing on the page to say which half
       * was the plan. The product exists to hold those two apart (PRODUCT.md
       * principle 1); the grid where triage actually happens was the one
       * surface not saying so.
       */
      { key: 'gap_est', label: '', width: 14, kind: 'gutter' },
      { key: 'est_start', label: 'Start', width: 92, kind: 'date', dateKey: 'estimateStart', group: 'estimate' },
      { key: 'est_end', label: 'End', width: 92, kind: 'date', dateKey: 'estimateEnd', group: 'estimate' },
      { key: 'est_d', label: 'Days', width: 58, align: 'right', kind: 'computed', group: 'estimate' },
      { key: 'gap_act', label: '', width: 14, kind: 'gutter' },
      { key: 'act_start', label: 'Start', width: 92, kind: 'date', dateKey: 'actualStart', group: 'actual' },
      { key: 'act_end', label: 'End', width: 92, kind: 'date', dateKey: 'actualEnd', group: 'actual' },
      { key: 'act_d', label: 'Days', width: 58, align: 'right', kind: 'computed', group: 'actual' },
      { key: 'gap_var', label: '', width: 14, kind: 'gutter' },
      { key: 'mis', label: 'Slip', width: 96, align: 'right', kind: 'misclosure', group: 'variance' },
      { key: 'gap_prog', label: '', width: 14, kind: 'gutter' },
      { key: 'closed', label: 'Closed', width: 74, align: 'right', kind: 'closed', group: 'progress' },
      ...rest.map((f) => ({
        key: f.id,
        label: f.name,
        width: widthFor(f.kind),
        align: (f.kind === 'money' || f.kind === 'number' ? 'right' : undefined) as 'right' | undefined,
        kind: 'field' as const,
        field: f,
      })),
    ];
  }, [fields, statusFieldId]);

  /**
   * The blocks a reader may pick up, and the grid in their order.
   *
   * A band travels whole and the name column is pinned — see `list-columns.ts`
   * for why. Everything downstream of here reads `columns`, so the arrangement
   * reaches the heads, the cells, the keyboard's column index and the group
   * band without any of them knowing it happened.
   */
  const blocks = useMemo(() => blocksOf(filedColumns), [filedColumns]);
  const columns = useMemo(
    () => arrangeColumns(filedColumns, columnOrder),
    [filedColumns, columnOrder],
  );
  const movableBlocks = useMemo(
    () => blocksOf(columns).filter((b) => !b.pinned),
    [columns],
  );

  /**
   * Move a column, for everybody.
   *
   * Optimistic, then confirmed: the grid rearranges in the hand that moved it
   * and the write follows. A refusal — a role that may not, a connection that
   * is not there — puts the previous order back and says so, rather than
   * leaving this reader looking at an arrangement nobody else has.
   */
  const commitColumnOrder = useCallback(async (next: string[]) => {
    const before = columnOrder;
    setColumnOrder(next);
    setFailure(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ columnOrder: next }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setColumnOrder(before);
        setFailure({ cell: '', message: err.message ?? 'The column did not move.' });
      }
    } catch {
      setColumnOrder(before);
      setFailure({ cell: '', message: 'No connection. The column did not move.' });
    }
  }, [columnOrder, projectId]);

  const moveColumn = useCallback(
    (key: string, to: number | 'left' | 'right') =>
      void commitColumnOrder(moveBlock(blocks, columnOrder, key, to)),
    [blocks, columnOrder, commitColumnOrder],
  );

  /** Which block a head belongs to, so dragging any head moves its whole band. */
  const blockOf = useCallback(
    (columnKey: string) =>
      movableBlocks.find((b) => b.columns.some((c) => c.key === columnKey)) ?? null,
    [movableBlocks],
  );

  /* ------------------------------------------------------------ sorting */

  /**
   * The columns offered to the sort, each named the way the header names it.
   *
   * Three columns read "Start", three read "Days": inside the grid the band
   * above the heads disambiguates them, but a menu has no band, so the group
   * has to come back into the label. Gutters and images are dropped — there is
   * nothing in a gutter, and an image has no order.
   */
  const sortColumns = useMemo<SortableColumn[]>(
    () => columns.filter(isSortable).map((c) => ({
      ...c,
      label: c.group ? `${GROUP_NAMES[c.group]} ${c.label.toLowerCase()}` : c.label,
    })),
    [columns],
  );

  const comparator = useMemo(
    () => makeComparator(sortTerms, sortColumns),
    [sortTerms, sortColumns],
  );

  const addSort = (key: string) =>
    setSortTerms((t) => (t.some((x) => x.key === key) ? t : [...t, { key, descending: false }]));
  const flipSort = (key: string) =>
    setSortTerms((t) => t.map((x) => (x.key === key ? { ...x, descending: !x.descending } : x)));
  const dropSort = (key: string) => setSortTerms((t) => t.filter((x) => x.key !== key));
  const moveSort = (key: string, by: -1 | 1) =>
    setSortTerms((t) => {
      const at = t.findIndex((x) => x.key === key);
      const to = at + by;
      if (at === -1 || to < 0 || to >= t.length) return t;
      const next = [...t];
      const [term] = next.splice(at, 1);
      next.splice(to, 0, term!);
      return next;
    });

  /* Both panels are menus, not modes: anything outside, or Escape, ends them. */
  useEffect(() => {
    const open = sortOpen || columnsOpen;
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!sortRef.current?.contains(e.target)) setSortOpen(false);
      if (!columnsRef.current?.contains(e.target)) setColumnsOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSortOpen(false); setColumnsOpen(false); }
    };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [sortOpen, columnsOpen]);

  /* --------------------------------------------------------------- tree */

  /** The project row. The grid never prints it: it is the page, not a row. */
  const root = rows.find((r) => r.led_depth === 1) ?? null;

  /**
   * Sorting reorders each parent's children among themselves; the tree stands.
   *
   * The Timeline made the opposite choice and flattens (see `timeline/sort.ts`)
   * because a picture of time that restarts at every module is not in date
   * order. Here the indent, the bracket, the module chip and the per-module add
   * row all say where a task is filed, and a flat run would make every one of
   * them a lie.
   */
  const byParent = useMemo(() => {
    const m = new Map<string | null, LedgerRow[]>();
    for (const r of rows) {
      const list = m.get(r.led_parent_id) ?? [];
      list.push(r);
      m.set(r.led_parent_id, list);
    }
    for (const [parentId, list] of m) {
      // Modules stand in name order unless the reader has asked for something
      // else; everything below them keeps the order it was filed in. See
      // `compareModuleNames` for why the two differ.
      const isModuleRow = parentId === (root?.led_node_id ?? null);
      list.sort(isModuleRow && sortTerms.length === 0 ? compareModuleNames : comparator);
    }
    return m;
  }, [rows, comparator, sortTerms, root]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.led_node_id, r])), [rows]);

  /** The modules as the run shows them: by name, or by whatever was sorted. */
  const modules = byParent.get(root?.led_node_id ?? null) ?? [];

  /**
   * The same modules in *filed* order, which is what the hues are numbered by.
   *
   * A module's colour is its identity — the one thing that has to survive
   * switching views, switching sort, and now standing in a different place in
   * the run. Numbering from the displayed order would repaint the whole rail
   * the moment a module was renamed, which turns the index into decoration.
   * The project Timeline numbers from `led_sort_order` too; that is what keeps
   * the two views agreeing.
   */
  const filedModules = useMemo(
    () => [...modules].sort((a, b) => a.led_sort_order - b.led_sort_order),
    [modules],
  );

  /**
   * Which module every row belongs to, by its filed position.
   *
   * The same map the Timeline builds, and deliberately the same numbers: a
   * module's colour has to be the one thing that survives switching views, or
   * it is decoration rather than an index. The fore-edge tabs, the chip in the
   * name column and the bars in the Timeline all read from here.
   */
  const moduleIndex = useMemo(() => {
    const m = new Map<string, number>();
    filedModules.forEach((n, i) => {
      const mark = (node: LedgerRow) => {
        m.set(node.led_node_id, i + 1);
        for (const k of byParent.get(node.led_node_id) ?? []) mark(k);
      };
      mark(n);
    });
    return m;
  }, [byParent, filedModules]);

  const descendantCount = useCallback(
    (id: string): number => {
      const kids = byParent.get(id) ?? [];
      return kids.length + kids.reduce((n, k) => n + descendantCount(k.led_node_id), 0);
    },
    [byParent],
  );

  /**
   * Searching walks the tree rather than filtering the flat list: a match deep
   * in a subtree is useless without the modules above it, so ancestors come
   * along and open themselves.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const r of rows) {
      if (!r.led_name.toLowerCase().includes(q)) continue;
      keep.add(r.led_node_id);
      let p = r.led_parent_id;
      while (p) {
        keep.add(p);
        p = byId.get(p)?.led_parent_id ?? null;
      }
    }
    return keep;
  }, [query, rows, byId]);

  type VisibleRow = { row: LedgerRow; kind: 'node' | 'add' | 'addmodule' | 'grouphead' };

  const visible = useMemo<VisibleRow[]>(() => {
    const out: VisibleRow[] = [];
    const walk = (parentId: string | null) => {
      for (const r of byParent.get(parentId) ?? []) {
        if (matches && !matches.has(r.led_node_id)) continue;
        out.push({ row: r, kind: 'node' });
        const open = matches ? true : expanded.has(r.led_node_id);
        // Each module block reprints the column heads under its own header, as
        // the reference does — a module's run can be long enough that the
        // sticky header at the top of the page is the only thing naming these
        // columns, and inside a block the eye wants the names again.
        if (r.led_depth === 2 && open) out.push({ row: r, kind: 'grouphead' });
        if (open) walk(r.led_node_id);
        // Every module block closes with a way to add to it.
        if (r.led_depth === 2 && open && canEdit && !matches) out.push({ row: r, kind: 'add' });
      }
    };
    walk(root?.led_node_id ?? null);
    // And the run as a whole closes with a way to add to it. A module is a
    // child of the project row, which the grid never prints — so this is the
    // one add that cannot hang off a row the reader can see, and it belongs at
    // the foot of the last module rather than inside it.
    if (root && canEdit && !matches) out.push({ row: root, kind: 'addmodule' });
    return out;
  }, [byParent, expanded, root, matches, canEdit]);

  const nodeRows = visible.filter((v) => v.kind === 'node');

  /* --------------------------------------------------------------- save */

  const patch = useCallback(async (node: LedgerRow, body: Record<string, unknown>, cellKey: string) => {
    const before = node;
    setSaving((s) => new Set(s).add(cellKey));
    setFailure(null);
    try {
      const res = await fetch(`/api/nodes/${node.led_node_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string; code?: string };
        setRows((rs) => rs.map((r) => (r.led_node_id === before.led_node_id ? before : r)));
        setFailure({ cell: cellKey, message: err.message ?? err.code ?? 'The change did not save.' });
        return;
      }
      // The response carries every recomputed figure, so nothing is refetched.
      const fresh = (await res.json()) as LedgerRow;
      setRows((rs) => rs.map((r) => (r.led_node_id === fresh.led_node_id ? fresh : r)));
    } catch {
      setRows((rs) => rs.map((r) => (r.led_node_id === before.led_node_id ? before : r)));
      setFailure({ cell: cellKey, message: 'No connection. The change did not save.' });
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(cellKey); return n; });
    }
  }, []);

  const rename = useCallback(async (node: LedgerRow, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.led_name) return;
    const before = node;
    setFailure(null);
    try {
      const res = await fetch(`/api/nodes/${node.led_node_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setRows((rs) => rs.map((r) => (r.led_node_id === before.led_node_id ? before : r)));
        setFailure({ cell: '', message: err.message ?? 'The name did not save.' });
        return;
      }
      const fresh = (await res.json()) as LedgerRow;
      setRows((rs) => rs.map((r) => (r.led_node_id === fresh.led_node_id ? fresh : r)));
    } catch {
      setFailure({ cell: '', message: 'No connection. The name did not save.' });
    }
  }, []);

  /**
   * Archiving takes the whole subtree (D-4), so the row says how many go with
   * it and asks a second time when it is more than one. Not a modal: the
   * question belongs beside the thing being archived, and a dialog that
   * interrupts is a dialog people learn to click through.
   *
   * The undo is real — `POST /api/nodes/:id/restore` — not a delay before a
   * delete.
   */
  const archive = useCallback(async (node: LedgerRow) => {
    setPendingArchive(null);
    setFailure(null);
    try {
      const res = await fetch(`/api/nodes/${node.led_node_id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setFailure({ cell: '', message: err.message ?? 'The task was not archived.' });
        return;
      }
      const { archived } = (await res.json()) as { archived: number };
      const gone = new Set<string>([node.led_node_id]);
      const sweep = (id: string) => {
        for (const k of byParent.get(id) ?? []) { gone.add(k.led_node_id); sweep(k.led_node_id); }
      };
      sweep(node.led_node_id);
      setRows((rs) => rs.filter((r) => !gone.has(r.led_node_id)));
      setSelected(null);
      setUndo({ nodeId: node.led_node_id, name: node.led_name, count: archived });
    } catch {
      setFailure({ cell: '', message: 'No connection. The task was not archived.' });
    }
  }, [byParent]);

  const restore = useCallback(async () => {
    if (!undo) return;
    const target = undo;
    setUndo(null);
    try {
      const res = await fetch(`/api/nodes/${target.nodeId}/restore`, { method: 'POST' });
      if (!res.ok) { setFailure({ cell: '', message: 'The task was not restored.' }); return; }
      const fresh = await fetch(`/api/projects/${projectId}/ledger`);
      if (fresh.ok) setRows((await fresh.json()) as LedgerRow[]);
      setSelected(target.nodeId);
    } catch {
      setFailure({ cell: '', message: 'No connection. The task was not restored.' });
    }
  }, [undo, projectId]);

  const create = useCallback(async (parentId: string, afterId: string | null) => {
    setFailure(null);
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentId, afterId, name: 'Untitled' }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setFailure({ cell: '', message: err.message ?? 'The task was not created.' });
        return;
      }
      const fresh = (await res.json()) as LedgerRow;
      setRows((rs) => [...rs, fresh]);
      setExpanded((s) => new Set(s).add(parentId));
      setSelected(fresh.led_node_id);
    } catch {
      setFailure({ cell: '', message: 'No connection. The task was not created.' });
    }
  }, []);

  /**
   * Indent and outdent (D-3, relaxed 2026-09-07).
   *
   * Indent means "become a child of the row above you at the same level";
   * outdent means "become a sibling of your parent". Both are ordinary moves,
   * so the depth ceiling and the cycle guard apply on the server as usual.
   */
  /**
   * The one write behind every move: drag, indent, outdent, nudge.
   *
   * `parentId` and `afterId` are what the endpoint takes, and every gesture in
   * the List resolves to a pair of them before it gets here — so promoting,
   * demoting, reordering and carrying a subtree to another module are one code
   * path with one failure message, not four.
   */
  const commitMove = useCallback(async (
    node: LedgerRow,
    placement: { parentId?: string; afterId?: string | null },
  ) => {
    setFailure(null);
    try {
      const res = await fetch(`/api/nodes/${node.led_node_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(placement),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setFailure({ cell: '', message: err.message ?? 'The move did not save.' });
        return;
      }
      // A move re-depths the whole subtree and renumbers its neighbours, so
      // the single row the response carries is not enough. This is the only
      // write that refetches.
      const fresh = await fetch(`/api/projects/${projectId}/ledger`);
      if (fresh.ok) setRows((await fresh.json()) as LedgerRow[]);
    } catch {
      setFailure({ cell: '', message: 'No connection. The move did not save.' });
    }
  }, [projectId]);

  /** Indent and outdent — `Alt ←→`, unchanged in what they mean (D-3). */
  const move = useCallback(async (node: LedgerRow, direction: 'in' | 'out') => {
    setFailure(null);

    if (direction === 'in') {
      const siblings = byParent.get(node.led_parent_id) ?? [];
      const at = siblings.findIndex((r) => r.led_node_id === node.led_node_id);
      const previous = at > 0 ? siblings[at - 1] : undefined;
      if (!previous) {
        setFailure({ cell: '', message: 'Nothing above it at this level to sit under.' });
        return;
      }
      // Under the row above, and at the end of its children — which is where
      // the eye expects it, immediately below what is already there.
      await commitMove(node, { parentId: previous.led_node_id, afterId: undefined });
      return;
    }

    const parent = node.led_parent_id ? byId.get(node.led_parent_id) : null;
    if (!parent || parent.led_depth <= 1) {
      setFailure({ cell: '', message: 'A module is already at the top level.' });
      return;
    }
    if (!parent.led_parent_id) return;
    // Out means "become the next sibling of the parent I just left", so it
    // lands directly below the block it came out of rather than at the end.
    await commitMove(node, { parentId: parent.led_parent_id, afterId: parent.led_node_id });
  }, [byParent, byId, commitMove]);

  /** `Alt ↑↓` — one place up or down among the rows it already sits with. */
  const nudge = useCallback(async (node: LedgerRow, direction: -1 | 1) => {
    setFailure(null);
    const siblings = byParent.get(node.led_parent_id) ?? [];
    const at = siblings.findIndex((r) => r.led_node_id === node.led_node_id);
    const to = at + direction;
    if (at === -1 || to < 0 || to >= siblings.length) return;

    // Moving down means landing behind the row below; moving up means landing
    // in front of the row above, which is the one before *that*.
    const afterId = direction === 1
      ? siblings[to]!.led_node_id
      : to > 0 ? siblings[to - 1]!.led_node_id : null;
    await commitMove(node, { afterId });
  }, [byParent, commitMove]);

  /**
   * What a pointer over this row would do, given what is in hand.
   *
   * Called on both `dragover` and `drop` so the mark the reader saw and the
   * move that happens are computed from the same rule — the alternative is a
   * drop that lands somewhere the highlight never promised.
   */
  const planFor = useCallback((
    target: LedgerRow,
    event: React.DragEvent<HTMLTableRowElement>,
  ): (DropPlan & { zone: DropZone }) | null => {
    const dragged = dragRow ? byId.get(dragRow) : null;
    if (!dragged) return null;

    /* `event.currentTarget`, never `event.nativeEvent.currentTarget`. The DOM
       sets `currentTarget` only while the event is being dispatched and clears
       it afterwards; React's synthetic event is the thing that still knows
       which element the handler was attached to. Reading it off the native
       event threw on the first drag. */
    const box = event.currentTarget.getBoundingClientRect();
    const height = subtreeHeightOf(dragged, rows);
    const zone = zoneFor(event.clientY - box.top, box.height, target.led_depth + 1 + height <= MAX_DEPTH);
    const plan = planDrop(dragged, target, zone, visible.filter((v) => v.kind === 'node').map((v) => v.row), {
      maxDepth: MAX_DEPTH,
      subtreeHeight: height,
      rootId: root?.led_node_id ?? null,
    });
    return { ...plan, zone };
  }, [dragRow, byId, rows, visible, root]);

  /*
   * Bring an arrival into view, once it is actually on the page.
   *
   * Declared here rather than beside the effect that sets `pendingScroll`
   * because it has to watch `visible`, which is computed further down. That
   * dependency is the whole point: the first two attempts at this scrolled on
   * a timer — one animation frame, then thirty — and both were guesses about
   * how long it takes React to render a couple of hundred newly revealed rows.
   * On the real project that is a little over two seconds, measured, so both
   * guesses expired long before the row existed and failed silently, leaving
   * the right row selected somewhere below the fold. Waiting for the row to
   * appear in `visible` is not a guess.
   */
  useEffect(() => {
    if (!pendingScroll) return;
    if (!visible.some((v) => v.kind === 'node' && v.row.led_node_id === pendingScroll)) return;
    const id = pendingScroll;
    setPendingScroll(null);
    requestAnimationFrame(() => {
      document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'center' });
    });
  }, [pendingScroll, visible]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  /* ----------------------------------------------------------- keyboard */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || editing) return;

      // `G` then `T` — the two-key chord for switching view.
      if (chord.current === 'g') {
        chord.current = null;
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          window.location.href = siblingHref(`/p/${slug}/timeline`, selected);
          return;
        }
      }
      if (e.key.toLowerCase() === 'g') { chord.current = 'g'; return; }

      if (!focus) {
        if (e.key === 'ArrowDown' && nodeRows.length) {
          e.preventDefault();
          setFocus({ row: 0, col: 0 });
          setSelected(nodeRows[0]!.row.led_node_id);
        }
        return;
      }

      const current = visible[focus.row];
      const node = current?.row;

      /* Alt with an arrow moves the row, not the cursor: horizontally it
         changes who the row's parent is, vertically its place among the rows
         it already sits with. Together they reach every move the drag does,
         which is the point — the drag is the fast way, not the only way. */
      if (canEdit && node && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        void move(node, e.key === 'ArrowRight' ? 'in' : 'out');
        return;
      }
      if (canEdit && node && e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        void nudge(node, e.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      const moveFocus = (dr: number, dc: number) => {
        e.preventDefault();
        let row = Math.max(0, Math.min(visible.length - 1, focus.row + dr));
        // Skip anything that is not a data row when arrowing: the add-task row
        // is a click target and the repeated head strip is furniture.
        while (visible[row] && visible[row]!.kind !== 'node'
               && row > 0 && row < visible.length - 1) row += dr || 1;
        const col = Math.max(0, Math.min(columns.length - 1, focus.col + dc));
        setFocus({ row, col });
        setSelected(visible[row]?.row.led_node_id ?? null);
      };

      switch (e.key) {
        case 'ArrowDown': moveFocus(1, 0); break;
        case 'ArrowUp': moveFocus(-1, 0); break;
        case 'ArrowRight': moveFocus(0, 1); break;
        case 'ArrowLeft': moveFocus(0, -1); break;

        case 'Tab': {
          e.preventDefault();
          const dir = e.shiftKey ? -1 : 1;
          const col = focus.col + dir;
          if (col >= columns.length) { setFocus({ row: Math.min(visible.length - 1, focus.row + 1), col: 0 }); }
          else if (col < 0) { setFocus({ row: Math.max(0, focus.row - 1), col: columns.length - 1 }); }
          else setFocus({ row: focus.row, col });
          break;
        }

        case 'Enter': {
          const col = columns[focus.col];
          if ((canEdit || col?.field?.kind === 'long_text') && col && col.kind !== 'computed' && col.kind !== 'closed'
              && col.kind !== 'misclosure' && col.kind !== 'gutter') {
            e.preventDefault();
            setEditing(true);
          }
          break;
        }

        case ' ':
          if (node && columns[focus.col]?.kind === 'name') { e.preventDefault(); toggle(node.led_node_id); }
          break;

        case 'e': case 'E':
          if (node) { e.preventDefault(); setDetail(true); }
          break;

        case 'F2':
          if (canEdit && node) { e.preventDefault(); setRenamingId(node.led_node_id); }
          break;

        case 'Delete':
          // Both routes to archiving lead through the same question.
          if (isAdmin && node) { e.preventDefault(); setPendingArchive(node); }
          break;

        case 'n': case 'N': {
          if (!canEdit) break;
          if (!node) {
            // Nothing selected: `n` starts a module, which is what the add row
            // at the foot of the run offers and the only thing there is to add
            // when no row is in hand.
            if (root) { e.preventDefault(); void create(root.led_node_id, null); }
            break;
          }
          e.preventDefault();
          if (e.shiftKey) {
            // a child of the focused row
            if (node.led_depth >= MAX_DEPTH) {
              setFailure({ cell: '', message: `A subtask cannot go deeper than ${MAX_DEPTH} levels.` });
              break;
            }
            void create(node.led_node_id, null);
          } else if (node.led_parent_id) {
            void create(node.led_parent_id, node.led_node_id);
          }
          break;
        }

        case 'ArrowRight':
        case 'ArrowLeft':
          break;   // handled above; listed so the intent is obvious

        case 'Escape':
          if (detail) setDetail(false);
          else { setSelected(null); setFocus(null); }
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, visible, nodeRows, columns, editing, canEdit, isAdmin, detail, selected, slug, root,
      create, move, nudge, archive, descendantCount]);

  /* -------------------------------------------------------- detail data */

  const detailRow = selected ? byId.get(selected) ?? null : null;
  const ancestors = useMemo(() => {
    const out: LedgerRow[] = [];
    let p = detailRow?.led_parent_id ?? null;
    while (p) {
      const node = byId.get(p);
      if (!node) break;
      out.unshift(node);
      p = node.led_parent_id;
    }
    return out;
  }, [detailRow, byId]);

  /* --------------------------------------------------------------- view */

  return (
    <div className="book">
      <nav className="rail" aria-label="Modules">
        {/* The tabs stand in the run's order, so the rail reads down the page
            as the page does — but each keeps the hue its module owns, which is
            numbered from the filed order and never from where it happens to
            sit. */}
        {modules.map((m) => (
          <button
            key={m.led_node_id}
            className="tab label"
            title={m.led_name}
            style={{
              ['--tab-hue' as string]: TAB_HUE(moduleIndex.get(m.led_node_id) ?? 1),
              flex: `${descendantCount(m.led_node_id) + 1} 1 0`,
            }}
            aria-current={selected === m.led_node_id}
            onClick={() => {
              setSelected(m.led_node_id);
              document.getElementById(`row-${m.led_node_id}`)?.scrollIntoView({ block: 'center' });
            }}
          >
            {m.led_name}
          </button>
        ))}
      </nav>

      <div className="sheet">
        <header className="head">
          {/* Up a level, to the shelf. Deliberately not in the view nav
              beside List / Timeline / Report: those are views *of this
              project* and this is the way out of it — filing a level change
              among sibling views because the two sit near each other is the
              grouping-by-adjacency this page has been unpicking. */}
          <a className="shelf label" href="/">‹ Home</a>
          <ProjectTitle projectId={projectId} name={projectName} canRename={isAdmin} />
          {/* The bell stands immediately before the view nav, so notice and
              navigation sit together in the one cluster this header already
              uses for "where do I go from here" (spec 11 §6). */}
          <Bell />
          <div className="views label">
            <span aria-current="page">List</span>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={siblingHref(`/p/${slug}/timeline`, selected)}>Timeline</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={`/p/${slug}/report`}>Report</a>
            <a href={`/p/${slug}/docs`}>Docs</a>
            {isAdmin && (
              <>
                <span style={{ color: 'var(--color-rule)' }}>·</span>
                <a href={`/p/${slug}/settings`}>Settings</a>
              </>
            )}
          </div>
          {/* Sits after the view nav rather than beside the shelf link, so the
              one control that ends the session is not adjacent to the one a
              hand reaches for constantly. Same reasoning as the shelf link's:
              it changes level, so it is not in the view nav. */}
          {signOut}
        </header>

        <div className="toolbar label">
          <input
            ref={searchRef}
            className="search"
            type="search"
            placeholder="Search  /"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
            aria-label="Search tasks"
          />
          <span className="count-of">
            <strong className="figure">{nodeRows.length}</strong> of {rows.length - 1}
          </span>
          {!canEdit && <span>· read only</span>}

          {/* Sorting is a property of the reading, not of the project, so it
              lives in the toolbar beside the search box rather than anywhere
              that looks like it writes. */}
          <div className="sortby" ref={sortRef}>
            <button
              type="button"
              className="sortby-open"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((o) => !o)}
              title="Order the run by one column or by several"
            >
              Sort
              {sortTerms.length > 0 && <span className="figure sortby-count">{sortTerms.length}</span>}
            </button>

            {sortOpen && (
              <div className="sortby-panel" role="group" aria-label="Sort by">
                {sortTerms.length === 0 && <p className="sortby-empty">Filed order.</p>}

                <ol className="sortby-terms">
                  {sortTerms.map((t, i) => {
                    const column = sortColumns.find((c) => c.key === t.key);
                    return (
                      <li key={t.key}>
                        {/* The rank is the whole point of allowing more than
                            one: the first column that separates two rows
                            decides them. */}
                        <span className="figure sortby-rank">{i + 1}</span>
                        <span className="sortby-name">{column?.label ?? t.key}</span>
                        <button
                          type="button"
                          onClick={() => flipSort(t.key)}
                          aria-label={`${column?.label ?? t.key}: ${t.descending ? 'descending' : 'ascending'}. Reverse it.`}
                          title="Reverse. Rows with nothing to sort on stay last either way."
                        >
                          {t.descending ? '↓' : '↑'}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSort(t.key, -1)}
                          disabled={i === 0}
                          aria-label={`Sort by ${column?.label ?? t.key} earlier`}
                          title="Earlier in the sort"
                        >
                          ⌃
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSort(t.key, 1)}
                          disabled={i === sortTerms.length - 1}
                          aria-label={`Sort by ${column?.label ?? t.key} later`}
                          title="Later in the sort"
                        >
                          ⌄
                        </button>
                        <button
                          type="button"
                          onClick={() => dropSort(t.key)}
                          aria-label={`Stop sorting by ${column?.label ?? t.key}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <div className="sortby-add">
                  <select
                    value=""
                    aria-label="Add a column to the sort"
                    onChange={(e) => { if (e.target.value) addSort(e.target.value); }}
                  >
                    <option value="">+ Add column…</option>
                    {sortColumns
                      .filter((c) => !sortTerms.some((t) => t.key === c.key))
                      .map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  {sortTerms.length > 0 && (
                    <button type="button" onClick={() => setSortTerms([])}>Clear</button>
                  )}
                </div>

                <p className="sortby-note">
                  Siblings are reordered inside their parent; the tree stands.
                </p>
              </div>
            )}
          </div>

          {/* Dragging a head is the fast way and the only one a mouse needs;
              this is the same act for a hand that is not holding one, and the
              only one a screen reader can reach at all.

              Admin only, because the arrangement is the project's: a Member
              who moved a column would be rearranging everybody's screen. The
              control is absent rather than disabled — a row of dead buttons
              teaches a Member nothing except that the page is broken. */}
          {isAdmin && (
          <div className="sortby" ref={columnsRef}>
            <button
              type="button"
              className="sortby-open"
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((o) => !o)}
              title="Move the columns for everybody on this project. Drag a column head to do the same."
            >
              Columns
              {columnOrder.length > 0 && <span className="figure sortby-count">·</span>}
            </button>

            {columnsOpen && (
              <div className="sortby-panel" role="group" aria-label="Column order">
                <ol className="sortby-terms">
                  {movableBlocks.map((b, i) => (
                    <li key={b.key}>
                      <span className="figure sortby-rank">{i + 1}</span>
                      <span className="sortby-name">{b.label}</span>
                      <button
                        type="button"
                        onClick={() => moveColumn(b.key, 'left')}
                        disabled={i === 0}
                        aria-label={`Move ${b.label} left`}
                        title="Left"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(b.key, 'right')}
                        disabled={i === movableBlocks.length - 1}
                        aria-label={`Move ${b.label} right`}
                        title="Right"
                      >
                        ›
                      </button>
                    </li>
                  ))}
                </ol>

                {columnOrder.length > 0 && (
                  <div className="sortby-add">
                    <button type="button" onClick={() => void commitColumnOrder([])}>
                      Back to the filed order
                    </button>
                  </div>
                )}

                <p className="sortby-note">
                  Everybody on this project sees this order. Estimate, Actual, Slip
                  and Closed each move whole: the band above the heads is what says
                  which is the plan. Name stays first.
                </p>
              </div>
            )}
          </div>
          )}

          {/* The add row at the foot of the run is where a module is added in
              the flow of reading it. This is the same act reached from the top
              of the page — a long run puts that row a scroll away, and a
              search hides it entirely. */}
          {canEdit && root && (
            <button type="button" className="toolbar-add" onClick={() => void create(root.led_node_id, null)}>
              + Module
            </button>
          )}
        </div>

        {failure && <div className="errata">{failure.message}</div>}

        {undo && (
          <div className="undo">
            <span>
              Archived <strong>{undo.name}</strong>
              {undo.count > 1 && ` and ${undo.count - 1} below it`}.
            </span>
            <button className="label" onClick={() => void restore()}>Undo</button>
            <button className="label dismiss" onClick={() => setUndo(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        <div className="pagebody">
          <div className="scroller">
            {rows.length <= 1 ? (
              <EmptyRun
                columns={columns}
                message={canEdit ? 'No modules yet.' : 'No modules yet. An admin adds the first one.'}
                action={canEdit && root
                  ? { label: '+ Add module', onClick: () => void create(root.led_node_id, null) }
                  : undefined}
              />
            ) : nodeRows.length === 0 ? (
              <EmptyRun columns={columns} message={`Nothing matches “${query}”.`} />
            ) : (
              <table className="run">
                <colgroup>{columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
                <thead>
                  <GroupBand columns={columns} />
                  <tr className="label heads">
                    {columns.map((c) => {
                      const at = sortTerms.findIndex((t) => t.key === c.key);
                      const term = at === -1 ? null : sortTerms[at]!;
                      // Admin only: the arrangement belongs to the project, so
                      // for everybody else the heads are simply not draggable.
                      const block = isAdmin ? blockOf(c.key) : null;
                      return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={term ? (term.descending ? 'descending' : 'ascending') : undefined}
                        /* Dragging any head of a band picks up the whole band.
                           The gutter is part of the block too, so a seam
                           travels with what it opens in front of. */
                        draggable={!!block}
                        onDragStart={(e) => {
                          if (!block) return;
                          setDragging(block.key);
                          e.dataTransfer.effectAllowed = 'move';
                          // Firefox will not start a drag without payload.
                          e.dataTransfer.setData('text/plain', block.key);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(e) => {
                          if (!block || !dragging || dragging === block.key) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          if (!block || !dragging || dragging === block.key) return;
                          e.preventDefault();
                          moveColumn(dragging, movableBlocks.findIndex((b) => b.key === block.key));
                          setDragging(null);
                        }}
                        data-drop={!!block && !!dragging && dragging !== block.key ? '' : undefined}
                        data-dragging={block && dragging === block.key ? '' : undefined}
                        /* The band is the eye's disambiguator, and it is
                           aria-hidden so it is not announced twice. Three
                           columns now read "Start" and three read "Days", so
                           the accessible name has to carry the group the label
                           dropped — otherwise a screen reader hears the same
                           header six times and can tell nothing apart. */
                        aria-label={c.group ? `${GROUP_NAMES[c.group]} ${c.label.toLowerCase()}` : undefined}
                        className={[
                          c.kind === 'name' ? 'nm' : '',
                          c.align === 'right' ? 'num' : '',
                          c.kind === 'gutter' ? 'gutter' : '',
                          isSortable(c) ? 'sortable' : '',
                        ].join(' ')}
                      >
                        {/* Click sorts by this column alone; shift-click adds
                            it to the sort already running, which is the same
                            two gestures the panel offers with more words. */}
                        {isSortable(c) ? (
                          <button
                            type="button"
                            className="head-sort"
                            onClick={(e) => {
                              if (term) {
                                if (e.shiftKey || sortTerms.length === 1) flipSort(c.key);
                                else setSortTerms([term]);
                              } else if (e.shiftKey) addSort(c.key);
                              else setSortTerms([{ key: c.key, descending: false }]);
                            }}
                          >
                            {c.label}
                            {term && (
                              <span className="head-mark" aria-hidden="true">
                                {term.descending ? '↓' : '↑'}
                                {sortTerms.length > 1 && <span className="figure">{at + 1}</span>}
                              </span>
                            )}
                          </button>
                        ) : c.label}
                      </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v, rowIdx) =>
                    v.kind === 'grouphead' ? (
                      <tr className="grouphead" key={`heads-${v.row.led_node_id}`} aria-hidden="true">
                        {columns.map((c) => (
                          /* No `scope` and the row is aria-hidden: the real
                             column heads are in the <thead> and already
                             associated. This strip is a visual reprint. */
                          <th
                            key={c.key}
                            className={[
                              c.kind === 'name' ? 'nm' : '',
                              c.align === 'right' ? 'num' : '',
                              c.kind === 'gutter' ? 'gutter' : '',
                            ].join(' ')}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    ) : v.kind === 'addmodule' ? (
                      /* No `--row-hue`: this row belongs to no module, and the
                         hue of the module it would inherit from would be a lie
                         about what it creates. */
                      <tr className="add-row module-add" key="add-module">
                        <td className="nm" onClick={() => void create(v.row.led_node_id, null)}>
                          <div className="nm-inner">
                            <span className="hole" />+ Add module
                          </div>
                        </td>
                        <td colSpan={columns.length - 1} />
                      </tr>
                    ) : v.kind === 'add' ? (
                      /* The add row closes its module's run, so it carries the
                         module's hue too and the spine down the indent does not
                         stop one row short of the bottom. */
                      <tr
                        className="add-row"
                        key={`add-${v.row.led_node_id}`}
                        style={{ ['--row-hue' as string]: TAB_HUE(moduleIndex.get(v.row.led_node_id) ?? 1) }}
                      >
                        <td className="nm" onClick={() => void create(v.row.led_node_id, null)}>
                          <div className="nm-inner" style={{ paddingLeft: 20 }}>
                            <span className="hole" />+ Add task
                          </div>
                        </td>
                        <td colSpan={columns.length - 1} />
                      </tr>
                    ) : (
                      <tr
                        key={v.row.led_node_id}
                        id={`row-${v.row.led_node_id}`}
                        className={v.row.led_depth === 2 ? 'module' : ''}
                        style={{ ['--row-hue' as string]: TAB_HUE(moduleIndex.get(v.row.led_node_id) ?? 1) }}
                        aria-selected={selected === v.row.led_node_id}
                        /* A row in hand is not a row being typed into, so a
                           cell that is open for editing suspends the drag
                           rather than fighting the caret for the pointer. */
                        draggable={canEdit && !editing && renamingId === null}
                        onDragStart={(e) => {
                          setDragRow(v.row.led_node_id);
                          setSelected(v.row.led_node_id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', v.row.led_name);
                        }}
                        onDragEnd={() => { setDragRow(null); setDropAt(null); }}
                        onDragOver={(e) => {
                          const plan = planFor(v.row, e);
                          if (!plan) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = plan.ok ? 'move' : 'none';
                          setDropAt({ id: v.row.led_node_id, zone: plan.zone, ok: plan.ok });
                        }}
                        onDrop={(e) => {
                          const plan = planFor(v.row, e);
                          setDropAt(null);
                          const dragged = dragRow ? byId.get(dragRow) : null;
                          setDragRow(null);
                          if (!plan || !dragged) return;
                          e.preventDefault();
                          if (!plan.ok) { setFailure({ cell: '', message: plan.reason }); return; }
                          void commitMove(dragged, { parentId: plan.parentId, afterId: plan.afterId });
                        }}
                        data-drop={dropAt?.id === v.row.led_node_id ? dropAt.zone : undefined}
                        data-drop-ok={dropAt?.id === v.row.led_node_id && dropAt.ok ? '' : undefined}
                        data-dragging={dragRow === v.row.led_node_id ? '' : undefined}
                      >
                        {columns.map((c, colIdx) => {
                          const cellKey = `${v.row.led_node_id}:${c.key}`;
                          const isFocused = focus?.row === rowIdx && focus?.col === colIdx;
                          return (
                            <Cell
                              key={c.key}
                              column={c}
                              row={v.row}
                              focused={isFocused}
                              editing={isFocused && editing}
                              saving={saving.has(cellKey)}
                              failed={failure?.cell === cellKey}
                              canEdit={canEdit}
                              people={people}
                              childCount={descendantCount(v.row.led_node_id)}
                              hasChildren={(byParent.get(v.row.led_node_id) ?? []).length > 0}
                              isExpanded={expanded.has(v.row.led_node_id) || !!matches}
                              onToggle={() => toggle(v.row.led_node_id)}
                              onFocus={() => { setFocus({ row: rowIdx, col: colIdx }); setSelected(v.row.led_node_id); }}
                              onEdit={() => setEditing(true)}
                              onCommit={(body) => { setEditing(false); void patch(v.row, body, cellKey); }}
                              onCancel={() => setEditing(false)}
                              canArchive={isAdmin}
                              canAddChild={v.row.led_depth < MAX_DEPTH}
                              /* `create` opens the parent and selects the new
                                 row itself, so there is nothing to do here. */
                              onAddChild={() => void create(v.row.led_node_id, null)}
                              renaming={renamingId === v.row.led_node_id}
                              onStartRename={() => setRenamingId(v.row.led_node_id)}
                              onCancelRename={() => setRenamingId(null)}
                              onRename={(name) => { setRenamingId(null); void rename(v.row, name); }}
                              onArchive={() => setPendingArchive(v.row)}
                            />
                          );
                        })}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </div>

          {pendingArchive && (
            <ConfirmArchive
              node={pendingArchive}
              descendants={descendantCount(pendingArchive.led_node_id)}
              onConfirm={() => void archive(pendingArchive)}
              onCancel={() => setPendingArchive(null)}
            />
          )}

          {detail && detailRow && (
            <DetailPanel
              row={detailRow}
              ancestors={ancestors}
              fields={fields}
              people={people}
              statusFieldId={statusFieldId}
              onClose={() => setDetail(false)}
            />
          )}
        </div>

        {/* The keys sat in the toolbar, one line under the search box, on every
            page load forever — permanent teaching content in the position the
            page's primary controls should hold, and at narrow widths it wrapped
            onto a second line and pushed the run down. It belongs at the foot:
            always there when a hand goes looking, never in the way of the work. */}
        <div className="keys label" role="note">
          <kbd>↑↓</kbd> move
          <kbd>Enter</kbd> edit
          <kbd>E</kbd> detail
          <kbd>N</kbd> new
          <kbd>Shift N</kbd> subtask
          <kbd>Alt ←→</kbd> outdent / indent
          <kbd>Alt ↑↓</kbd> move up / down
          <kbd>G T</kbd> timeline
        </div>
      </div>
    </div>
  );
}

/** A ruled page with its columns drawn and no rows. Never an illustration. */
function EmptyRun(
  { columns, message, action }:
  { columns: Column[]; message: string; action?: { label: string; onClick: () => void } },
) {
  return (
    <table className="run">
      <colgroup>{columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
      <thead>
        <GroupBand columns={columns} />
        <tr className="label heads">
          {columns.map((c) => (
            <th key={c.key} scope="col" className={c.kind === 'name' ? 'nm' : ''}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="nm empty" colSpan={columns.length}>
            {message}
            {action && (
              <>
                {' '}
                <button type="button" className="empty-add" onClick={action.onClick}>
                  {action.label}
                </button>
              </>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ==================================================================== cell */

type CellProps = {
  column: Column;
  row: LedgerRow;
  focused: boolean;
  editing: boolean;
  saving: boolean;
  failed: boolean;
  canEdit: boolean;
  people: Person[];
  childCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onEdit: () => void;
  onCommit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
  canArchive: boolean;
  /** False on a row already at the depth ceiling (D-1), so the control is
   *  absent rather than present and guaranteed to fail. */
  canAddChild: boolean;
  onAddChild: () => void;
  renaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
};

function Cell(p: CellProps) {
  const { column: c, row: r } = p;
  const ref = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (p.focused && !p.editing && !p.renaming) ref.current?.focus({ preventScroll: false });
  }, [p.focused, p.editing, p.renaming]);

  const editable =
    p.canEdit && c.kind !== 'computed' && c.kind !== 'closed' && c.kind !== 'misclosure'
    && c.kind !== 'gutter';

  return (
    <td
      ref={ref}
      tabIndex={p.focused ? 0 : -1}
      className={[
        c.kind === 'name' ? 'nm' : '',
        c.align === 'right' ? 'num' : '',
        c.kind === 'gutter' ? 'gutter' : '',
        editable ? 'editable' : '',
        p.editing ? 'editing' : '',
        p.saving ? 'saving' : '',
        p.failed ? 'failed' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => {
        p.onFocus();
        if ((!editable && c.field?.kind !== 'long_text') || p.editing || p.renaming) return;
        if (c.kind === 'name') {
          p.onCancel();
          p.onStartRename();
        } else {
          p.onEdit();
        }
      }}
    >
      {c.kind === 'name' && <NameCell {...p} />}
      {c.kind === 'date' && <DateCell {...p} />}
      {c.kind === 'computed' && (
        <span className="computed">
          {(c.key === 'est_d' ? r.led_estimate_workdays : r.led_actual_workdays) || <Dash />}
        </span>
      )}
      {c.kind === 'closed' && <Closed row={r} />}
      {c.kind === 'misclosure' && <Misclosure row={r} />}
      {c.kind === 'field' && c.field && <FieldCell {...p} field={c.field} />}
    </td>
  );
}

const Dash = () => <span className="empty">—</span>;

/**
 * The band above the column heads.
 *
 * It exists to make one distinction structural instead of remembered: which
 * half of the grid is the plan and which is what happened. Consecutive columns
 * carrying the same `group` are spanned by a single label; everything else
 * spans blank, because a band that labels every column is just a second header.
 */
function GroupBand({ columns }: { columns: Column[] }) {
  const runs: { group?: Column['group']; span: number; name?: boolean }[] = [];
  for (const c of columns) {
    const last = runs[runs.length - 1];
    // The name column never merges into a run: it is sticky-left, and a cell
    // spanning past it could not pin to the same edge.
    if (c.kind === 'name') runs.push({ group: c.group, span: 1, name: true });
    else if (last && !last.name && last.group === c.group) last.span += 1;
    else runs.push({ group: c.group, span: 1 });
  }

  return (
    <tr className="label band" aria-hidden="true">
      {runs.map((r, i) => (
        <th
          key={i}
          colSpan={r.span}
          scope="colgroup"
          className={[r.group ? `band-${r.group}` : 'band-blank', r.name ? 'nm' : ''].join(' ')}
        >
          {r.group ? GROUP_NAMES[r.group] : ''}
        </th>
      ))}
    </tr>
  );
}

function NameCell(p: CellProps) {
  const { row: r } = p;

  if (p.renaming) {
    return (
      <div className="nm-inner" style={{ paddingLeft: (r.led_depth - 2) * 20 }}>
        <span className="hole" />
        {r.led_depth > 2 && <span className="bracket" />}
        <span className="twist leaf" />
        <input
          className="cell-input"
          defaultValue={r.led_name}
          autoFocus
          lang={isThai(r.led_name) ? 'th' : 'en'}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') p.onCancelRename();
            if (e.key === 'Enter') p.onRename(e.currentTarget.value);
          }}
          onBlur={(e) => p.onRename(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="nm-inner" style={{ paddingLeft: (r.led_depth - 2) * 20 }}>
      <span className="hole" />
      {r.led_depth > 2 && <span className="bracket" />}
      <button
        className={`twist${p.hasChildren ? '' : ' leaf'}`}
        aria-expanded={p.isExpanded}
        aria-label={p.isExpanded ? 'Collapse' : 'Expand'}
        onClick={(e) => { e.stopPropagation(); p.onToggle(); }}
      />
      {/* The module's colour, stated once at the head of its run. Below it the
          rows carry the same hue in a hairline down the indent, so a task is
          traceable to its module without reading back up the page. */}
      {r.led_depth === 2 && <span className="modchip" aria-hidden="true" />}
      {/* Names ellipse at 440px, so the full text has to stay reachable without
          opening the row. */}
      <span className="name-text" title={r.led_name} lang={isThai(r.led_name) ? 'th' : 'en'}>{r.led_name}</span>
      {r.led_depth === 2 && <span className="count figure">{p.childCount}</span>}

      {/* Drawn rather than borrowed: 1px strokes with square ends and no
          rounded corners, the same hand as the rules on the page. A generic
          icon set would be the one imported voice in the whole interface. */}
      {(
        <span className="rowacts">
          {/* Add a subtask under this row. The module block's "+ Add task" foot
              only ever files at module level; this is the way to file *under*
              the row the cursor is on, and it is the same operation Shift-N
              already performs from the keyboard. */}
          {p.canEdit && p.canAddChild && (
            <button
              className="rowact"
              aria-label={`Add a subtask under ${r.led_name}`}
              title="Add subtask  ·  Shift N"
              onClick={(e) => { e.stopPropagation(); p.onAddChild(); }}
            >
              {/* a plus, drawn in the same 1px hand as the other two */}
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M7 2.6 V11.4" />
                <path d="M2.6 7 H11.4" />
              </svg>
            </button>
          )}
          {p.canEdit && (
            <button
              className="rowact"
              aria-label={`Rename ${r.led_name}`}
              title="Rename  ·  F2"
              onClick={(e) => { e.stopPropagation(); p.onStartRename(); }}
            >
              {/* a pencil: shaft, ferrule, point */}
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 12 L2.6 9.6 L9.8 2.4 L11.6 4.2 L4.4 11.4 Z" />
                <path d="M8.6 3.6 L10.4 5.4" />
                <path d="M2.6 9.6 L4.4 11.4" />
              </svg>
            </button>
          )}
          {p.canArchive && (
            <button
              className="rowact"
              aria-label={`Archive ${r.led_name}`}
              title="Archive  ·  Del"
              onClick={(e) => { e.stopPropagation(); p.onArchive(); }}
            >
              {/* a bin: lid, handle, body, two staves */}
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 3.6 H12" />
                <path d="M5.6 3.6 V2.2 H8.4 V3.6" />
                <path d="M3.2 3.6 L3.9 12 H10.1 L10.8 3.6" />
                <path d="M5.9 5.6 V10 M8.1 5.6 V10" />
              </svg>
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Progress, counted rather than claimed (Q3).
 *
 * `12 / 41` is a fact about how many descendants sit at a `done` stage. A
 * percentage was rejected: it reads more precise than it is, and it cannot be
 * checked against anything. A leaf shows nothing at all — its own status is
 * already in its status cell, and repeating it as `0 / 0` would be noise.
 */
function Closed({ row }: { row: LedgerRow }) {
  if (row.led_descendant_count === 0) return <Dash />;
  return (
    <span className="computed">
      {row.led_closed_count} <span className="empty">/</span> {row.led_descendant_count}
    </span>
  );
}

function Misclosure({ row }: { row: LedgerRow }) {
  if (row.led_out_of_closure) return <span className="slip">out of closure</span>;
  const m = row.led_misclosure_end;
  if (m === null) return <Dash />;
  if (m === 0) return <span className="computed">0</span>;
  return <span className="slip">{m > 0 ? '+' : '−'}{Math.abs(m)}d</span>;
}

function DateCell(p: CellProps) {
  const { row: r, column: c } = p;
  const key = c.dateKey!;
  const value =
    key === 'estimateStart' ? r.led_estimate_start
    : key === 'estimateEnd' ? r.led_estimate_end
    : key === 'actualStart' ? r.led_actual_start
    : r.led_actual_end;

  const isActual = key.startsWith('actual');
  const source = key === 'actualStart' ? r.led_source_start : r.led_source_end;
  // Blue-black means the system derived it; graphite means a person set it.
  const ink = isActual && source === 'auto' ? 'computed' : 'entered';

  if (p.editing) {
    return (
      <input
        className="cell-input fig"
        type="date"
        defaultValue={value ?? ''}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
          if (e.key === 'Enter') p.onCommit({ [key]: (e.target as HTMLInputElement).value || null });
        }}
        onBlur={(e) => p.onCommit({ [key]: e.target.value || null })}
      />
    );
  }
  return <span className={ink}>{fmtDate(value) ?? <Dash />}</span>;
}

function FieldCell(p: CellProps & { field: FieldDef }) {
  const { row: r, field: f } = p;
  const raw = r.led_custom_values?.[f.id] ?? null;

  if (f.kind === 'long_text') return <LongTextCell {...p} value={raw == null ? '' : String(raw)} />;

  if (f.kind === 'image') return <ImageField nodeId={r.led_node_id} fieldId={f.id} label={f.name} value={raw} editing={p.editing} canEdit={p.canEdit} onCommit={(value) => p.onCommit({ values: { [f.id]: value } })} onCancel={p.onCancel} />;

  if (p.editing) return <FieldEditor {...p} field={f} value={raw} />;

  switch (f.kind) {
    case 'select': {
      const opt = f.options.find((o) => o.id === raw);
      if (!opt) return <Dash />;
      return (
        <span
          className={`pill${opt.archived ? ' opt-archived' : ''}`}
          style={{ ['--opt-hue' as string]: TAB_HUE(opt.colorIndex) }}
        >
          {opt.label}
          {opt.archived && <span className="arch">ARCH</span>}
        </span>
      );
    }
    case 'multi_select': {
      const ids = Array.isArray(raw) ? raw : [];
      if (!ids.length) return <Dash />;
      return (
        <span className="opt" style={{ gap: 4 }}>
          {ids.map((id) => {
            const o = f.options.find((x) => x.id === id);
            return o ? (
              <span className="pill" key={id} style={{ ['--opt-hue' as string]: TAB_HUE(o.colorIndex) }}>
                {o.label}
              </span>
            ) : null;
          })}
        </span>
      );
    }
    case 'people': {
      const ids = Array.isArray(raw) ? raw : [];
      if (!ids.length) return <Dash />;
      return <span>{ids.map((id) => p.people.find((u) => u.id === id)?.name ?? '—').join(', ')}</span>;
    }
    case 'money': {
      const m = raw as MoneyValue | null;
      if (!m) return <Dash />;
      return <span className="entered">{m.amount.toLocaleString('en-US')} <span className="empty">{m.currency}</span></span>;
    }
    case 'checkbox':
      return <span>{raw === true ? '✓' : <Dash />}</span>;
    case 'number':
      return raw === null ? <Dash /> : <span className="entered">{String(raw)}</span>;
    case 'date':
      return <span className="entered">{fmtDate(raw as string | null) ?? <Dash />}</span>;
    default: {
      const s = raw === null ? null : String(raw);
      if (!s) return <Dash />;
      return <span lang={isThai(s) ? 'th' : 'en'}>{s}</span>;
    }
  }
}

function LongTextCell(p: CellProps & { field: FieldDef; value: string }) {
  return <>
    <button type="button" className="long-text-preview" aria-label={`Open ${p.field.name}`} aria-haspopup="dialog"
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); p.onFocus(); p.onEdit(); }}>
      {p.value || <Dash />}
    </button>
    {p.editing && <LongTextPopup {...p} />}
  </>;
}

function LongTextPopup(p: CellProps & { field: FieldDef; value: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(p.value);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="long-text-popup" aria-label={p.field.name}
    onCancel={(e) => { e.preventDefault(); p.onCancel(); }}
    onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) p.onCancel(); }}
    onKeyDown={(e) => e.stopPropagation()}>
    <div className="long-text-popup-body">
      <h2>{p.field.name}</h2>
      {p.canEdit ? <textarea aria-label={p.field.name} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        : <div className="long-text-content" tabIndex={0}>{p.value || 'No text'}</div>}
      <div className="overleaf-actions long-text-actions">
        <button type="button" onClick={p.onCancel}>{p.canEdit ? 'Cancel' : 'Close'}</button>
        {p.canEdit && <button type="button" className="long-text-save" onClick={() => p.onCommit({ values: { [p.field.id]: draft || null } })}>Save</button>}
      </div>
    </div>
  </dialog>;
}

function FieldEditor(p: CellProps & { field: FieldDef; value: unknown }) {
  const { field: f } = p;
  const selectRef = useRef<HTMLDivElement>(null);
  const isSelect = f.kind === 'select' || f.kind === 'multi_select' || f.kind === 'people';
  const { onCancel } = p;

  useEffect(() => {
    if (!isSelect) return;
    const dismissOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !selectRef.current?.contains(event.target)) {
        onCancel();
      }
    };
    // Capture also catches clicks on controls that stop propagation.
    document.addEventListener('click', dismissOutside, true);
    return () => document.removeEventListener('click', dismissOutside, true);
  }, [isSelect, onCancel]);

  const commit = (v: unknown) => p.onCommit({ values: { [f.id]: v } });

  if (isSelect) {
    const isMulti = f.kind !== 'select';
    const current: string[] = Array.isArray(p.value) ? p.value : p.value ? [String(p.value)] : [];
    const items =
      f.kind === 'people'
        ? p.people.map((u) => ({ id: u.id, label: u.name, colorIndex: 1, stage: null, archived: false }))
        : f.options.filter((o) => !o.archived);

    return (
      /*
       * The click must not reach the cell.
       *
       * `onCommit` sets `editing` to false, but the same click then bubbled to
       * the `<td>`, whose handler opens the editor on a cell click,
       * and set it straight back to true — so picking an option closed the
       * list and reopened it in the same frame, which looked like it had never
       * closed at all. Stopping the click here is what makes the choice the
       * last thing that happens.
       */
      <div ref={selectRef} className="leaf" role="listbox" aria-label={f.name} aria-multiselectable={isMulti} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => commit(null)}><span className="empty">Clear</span></button>
        {items.map((o) => (
          <button
            key={o.id}
            role="option"
            aria-selected={current.includes(o.id)}
            onClick={() => commit(isMulti
              ? (current.includes(o.id) ? current.filter((x) => x !== o.id) : [...current, o.id])
              : o.id)}
          >
            {isMulti && (
              <span className="selection-mark" aria-hidden="true">
                {current.includes(o.id) ? '✓' : ''}
              </span>
            )}
            {f.kind !== 'people' && (
              <span className="swatch" style={{ ['--opt-hue' as string]: TAB_HUE(o.colorIndex) }} />
            )}
            {o.label}
            {o.stage && (
              <span className="stage">
                {o.stage === 'notStarted' ? 'not started' : o.stage === 'inProgress' ? 'running' : 'closed'}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (f.kind === 'checkbox') {
    return (
      /* Same reason as the option list: the commit closes the editor and the
         click must not travel on to the cell and reopen it. */
      <input className="cell-input" type="checkbox" defaultChecked={p.value === true} autoFocus
             onClick={(e) => e.stopPropagation()}
             onChange={(e) => commit(e.target.checked)} />
    );
  }

  const isMoney = f.kind === 'money';
  const isNumber = f.kind === 'number' || isMoney;
  const initial = isMoney
    ? String((p.value as MoneyValue | null)?.amount ?? '')
    : p.value == null ? '' : String(p.value);

  const commitInput = (text: string) => {
    if (text === '') return commit(null);
    if (isMoney) return commit({ amount: Number(text), currency: f.settings.currency ?? 'THB' });
    if (f.kind === 'number') return commit(Number(text));
    commit(text);
  };

  return (
    <input
      className={`cell-input${isNumber ? ' fig' : ''}`}
      type={f.kind === 'date' ? 'date' : isNumber ? 'number' : 'text'}
      defaultValue={initial}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Escape') p.onCancel();
        if (e.key === 'Enter') commitInput(e.currentTarget.value);
      }}
      onBlur={(e) => commitInput(e.target.value)}
    />
  );
}

function widthFor(kind: string): number {
  switch (kind) {
    case 'long_text': return 220;
    case 'text': return 180;
    case 'money': case 'number': return 110;
    case 'date': return 92;
    case 'select': return 140;
    case 'multi_select': return 190;
    case 'checkbox': return 60;
    case 'people': return 130;
    default: return 140;
  }
}
