'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LedgerRow, MoneyValue } from '@/db/schema';
import type { FieldDef, Person } from '@/lib/ledger';
import { MAX_DEPTH } from '@/lib/constants';
import DetailPanel from './detail-panel';
import ProjectTitle from './project-title';
import ConfirmArchive from './confirm-archive';
import {
  loadSet, saveSet, selectedFromUrl, writeSelectedToUrl, siblingHref,
} from './view-state';
import './list.css';

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
  projectId, projectName, slug, rows: initialRows, fields, people, statusFieldId, canEdit, isAdmin,
  signOut,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<{ cell: string; message: string } | null>(null);
  const [pendingArchive, setPendingArchive] = useState<LedgerRow | null>(null);
  const [undo, setUndo] = useState<{ nodeId: string; name: string; count: number } | null>(null);
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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
    const carried = selectedFromUrl();
    if (carried) setSelected(carried);
    setReady(true);
  }, [slug, initialRows]);

  useEffect(() => { if (ready) saveSet(slug, 'expanded', expanded); }, [ready, slug, expanded]);
  useEffect(() => { if (ready) writeSelectedToUrl(selected); }, [ready, selected]);

  /* ------------------------------------------------------------ columns */

  const columns = useMemo<Column[]>(() => {
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

  /* --------------------------------------------------------------- tree */

  const byParent = useMemo(() => {
    const m = new Map<string | null, LedgerRow[]>();
    for (const r of rows) {
      const list = m.get(r.led_parent_id) ?? [];
      list.push(r);
      m.set(r.led_parent_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.led_sort_order - b.led_sort_order);
    return m;
  }, [rows]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.led_node_id, r])), [rows]);
  const root = rows.find((r) => r.led_depth === 1) ?? null;
  const modules = byParent.get(root?.led_node_id ?? null) ?? [];

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
    (byParent.get(root?.led_node_id ?? null) ?? []).forEach((n, i) => {
      const mark = (node: LedgerRow) => {
        m.set(node.led_node_id, i + 1);
        for (const k of byParent.get(node.led_node_id) ?? []) mark(k);
      };
      mark(n);
    });
    return m;
  }, [byParent, root]);

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
  const move = useCallback(async (node: LedgerRow, direction: 'in' | 'out') => {
    setFailure(null);

    let parentId: string | null = null;

    if (direction === 'in') {
      const siblings = byParent.get(node.led_parent_id) ?? [];
      const at = siblings.findIndex((r) => r.led_node_id === node.led_node_id);
      const previous = at > 0 ? siblings[at - 1] : undefined;
      if (!previous) {
        setFailure({ cell: '', message: 'Nothing above it at this level to sit under.' });
        return;
      }
      parentId = previous.led_node_id;
    } else {
      const parent = node.led_parent_id ? byId.get(node.led_parent_id) : null;
      if (!parent || parent.led_depth <= 1) {
        setFailure({ cell: '', message: 'A module is already at the top level.' });
        return;
      }
      parentId = parent.led_parent_id;
    }
    if (!parentId) return;

    try {
      const res = await fetch(`/api/nodes/${node.led_node_id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setFailure({ cell: '', message: err.message ?? 'The move did not save.' });
        return;
      }
      // A move re-depths the whole subtree, so the single row the response
      // carries is not enough. This is the only write that refetches.
      const fresh = await fetch(`/api/projects/${projectId}/ledger`);
      if (fresh.ok) setRows((await fresh.json()) as LedgerRow[]);
    } catch {
      setFailure({ cell: '', message: 'No connection. The move did not save.' });
    }
  }, [byParent, byId, projectId]);

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

      // Alt with a horizontal arrow re-parents rather than moving the cursor.
      if (canEdit && node && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        void move(node, e.key === 'ArrowRight' ? 'in' : 'out');
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
          if (canEdit && col && col.kind !== 'computed' && col.kind !== 'closed'
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
      create, move, archive, descendantCount]);

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
        {modules.map((m, i) => (
          <button
            key={m.led_node_id}
            className="tab label"
            title={m.led_name}
            style={{ ['--tab-hue' as string]: TAB_HUE(i + 1), flex: `${descendantCount(m.led_node_id) + 1} 1 0` }}
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
          <a className="shelf label" href="/">‹ Field Book</a>
          <ProjectTitle projectId={projectId} name={projectName} canRename={isAdmin} />
          <div className="views label">
            <span aria-current="page">List</span>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={siblingHref(`/p/${slug}/timeline`, selected)}>Timeline</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={`/p/${slug}/report`}>Report</a>
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
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
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
                        ].join(' ')}
                      >
                        {c.label}
                      </th>
                    ))}
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
    if (p.focused && !p.editing) ref.current?.focus({ preventScroll: false });
  }, [p.focused, p.editing]);

  const editable =
    p.canEdit && c.kind !== 'computed' && c.kind !== 'closed' && c.kind !== 'misclosure'
    && c.kind !== 'gutter' && c.kind !== 'name';

  return (
    <td
      ref={ref}
      tabIndex={p.focused ? 0 : -1}
      className={[
        c.kind === 'name' ? 'nm' : '',
        c.align === 'right' ? 'num' : '',
        c.kind === 'gutter' ? 'gutter' : '',
        p.editing ? 'editing' : '',
        p.saving ? 'saving' : '',
        p.failed ? 'failed' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => { const wasFocused = p.focused; p.onFocus(); if (editable && wasFocused) p.onEdit(); }}
      onDoubleClick={() => editable && p.onEdit()}
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

function FieldEditor(p: CellProps & { field: FieldDef; value: unknown }) {
  const { field: f } = p;
  const commit = (v: unknown) => p.onCommit({ values: { [f.id]: v } });

  if (f.kind === 'select' || f.kind === 'multi_select' || f.kind === 'people') {
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
       * the `<td>`, whose handler reads "already focused, so open the editor"
       * and set it straight back to true — so picking an option closed the
       * list and reopened it in the same frame, which looked like it had never
       * closed at all. Stopping the click here is what makes the choice the
       * last thing that happens.
       */
      <div className="leaf" role="listbox" onClick={(e) => e.stopPropagation()}>
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
