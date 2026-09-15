'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LedgerRow } from '@/db/schema';
import type { FieldDef, Person } from '@/lib/ledger';
import { loadSet, saveSet, loadRecord, saveRecord, selectedFromUrl, writeSelectedToUrl, siblingHref } from '../view-state';
import { SORTS, DEFAULT_SORT, orderRows, type SortKey } from './sort';
import {
  filterColumnsFrom, rowMatches, liveTerms, type FilterTerm,
} from '../list-filter';
import FilterMenu from '../filter-menu';
import ProjectTitle from '../project-title';
import '../list.css';
import './timeline.css';
import Bell from '../../../bell';

/**
 * The Timeline (spec 04).
 *
 * The thing no competitor does: two permanently separate date ranges drawn in
 * the same row. Estimate above in pencil, actual below in ink. Both draggable.
 *
 * Dragging an estimate writes exactly what was dropped — estimates are never
 * snapped (D-17). Dragging an actual writes the raw value, and the server
 * snaps it forward to a working day (D-15), so the bar can visibly settle a
 * day or two right of where it was released. That second step is deliberate:
 * an invisible correction would read as a bug.
 */

type Props = {
  projectId: string;
  projectName: string;
  slug: string;
  rows: LedgerRow[];
  holidays: string[];
  fields: FieldDef[];
  people: Person[];
  statusFieldId: string | null;
  canEdit: boolean;
  isAdmin: boolean;
};

type Zoom = 'day' | 'week' | 'month';
type Mode = 'est' | 'act' | 'both';

const DAY_W: Record<Zoom, number> = { day: 26, week: 12, month: 4 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TAB_HUE = (i: number) => `var(--color-tab-${((i - 1) % 6) + 1})`;

const MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * MS));
const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);

export default function TimelineView({
  projectId, projectName, slug, rows, holidays, fields, people, statusFieldId, canEdit, isAdmin,
}: Props) {
  const [zoom, setZoom] = useState<Zoom>('day');
  const [mode, setMode] = useState<Mode>('both');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [descending, setDescending] = useState(false);
  const [query, setQuery] = useState('');
  /**
   * The values the run is narrowed to, per column.
   *
   * This replaced three single-choice `<select>`s — status, assignee, module.
   * Each could only ever ask about one value, and the question a timeline is
   * actually read with is "what is Doing *or* Blocked", or "Ann *and* Bee".
   * The shared menu is the List's, so the same question is asked the same way
   * in both views; the rules live in `list-filter.ts`.
   */
  const [filterTerms, setFilterTerms] = useState<FilterTerm[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState(rows);
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Precision drag is not achievable on a narrow screen, and an accidental
  // write is worse than a missing feature (spec 04 §10).
  const [wideEnough, setWideEnough] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const carried = selectedFromUrl();
    if (carried) setSelected(carried);
    setCollapsed(loadSet(slug, 'collapsed'));

    const view = loadRecord<{ mode?: Mode; zoom?: Zoom; sort?: SortKey; descending?: boolean }>(
      slug, 'timeline', {},
    );
    if (view.mode) setMode(view.mode);
    if (view.zoom) setZoom(view.zoom);
    if (view.sort) setSort(view.sort);
    if (view.descending !== undefined) setDescending(view.descending);
    setFilterTerms(loadRecord<FilterTerm[]>(slug, 'timeline-filter', []));
    setReady(true);

    const mq = window.matchMedia('(min-width: 700px)');
    const sync = () => setWideEnough(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [slug]);

  useEffect(() => { if (ready) writeSelectedToUrl(selected); }, [ready, selected]);

  const draggable = canEdit && wideEnough;

  const dayW = DAY_W[zoom];
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const today = useMemo(() => toIso(new Date(Date.now() + 7 * 3600 * 1000)), []);

  /* ------------------------------------------------------------- window */

  /**
   * The window is a year either side of today, widened further if the project
   * itself reaches past that.
   *
   * A fixed year of runway means a date can always be dragged forward without
   * the field ending, and a year of history means finished work stays visible
   * rather than falling off the left edge. The cost is a wide field — 730 days
   * at 26px is about 19,000px — which is why the view scrolls to today on
   * open rather than starting at the far left.
   */
  const { start, days } = useMemo(() => {
    const all: string[] = [];
    for (const r of live) {
      for (const d of [r.led_estimate_start, r.led_estimate_end, r.led_actual_start, r.led_actual_end,
                       r.led_rollup_est_start, r.led_rollup_est_end]) {
        if (d) all.push(d);
      }
    }
    all.sort();

    const earliest = all[0] && all[0] < addDays(today, -365) ? all[0] : addDays(today, -365);
    const latest = all.length && all[all.length - 1]! > addDays(today, 365)
      ? all[all.length - 1]!
      : addDays(today, 365);

    const first = addDays(earliest, -7);
    const last = addDays(latest, 7);
    return { start: first, days: diffDays(first, last) + 1 };
  }, [live, today]);

  const x = useCallback((iso: string) => diffDays(start, iso) * dayW, [start, dayW]);
  const width = days * dayW;

  const isOff = useCallback(
    (iso: string) => {
      const dow = toDate(iso).getUTCDay();
      return dow === 0 || dow === 6 || holidaySet.has(iso);
    },
    [holidaySet],
  );

  /**
   * Open on today (spec 04 §5), placed 40% from the left so recent history is
   * visible beside what is coming. Without this the field opens a year in the
   * past, on empty ruling.
   *
   * Runs once per zoom change, not on every render: re-centring while somebody
   * is scrolling would fight them for control of the view.
   */
  const scrollToToday = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = diffDays(start, today) * dayW - el.clientWidth * 0.4 + 320;
    el.scrollLeft = Math.max(0, target);
  }, [start, dayW, today]);

  useEffect(() => { scrollToToday(); }, [scrollToToday]);

  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days],
  );

  /* --------------------------------------------------------------- tree */

  const byParent = useMemo(() => {
    const m = new Map<string | null, LedgerRow[]>();
    for (const r of live) {
      const list = m.get(r.led_parent_id) ?? [];
      list.push(r);
      m.set(r.led_parent_id, list);
    }

    // Filed order only. This map is the tree's structure, used for roll-ups
    // and for the parent walk; the order rows are *drawn* in comes from
    // orderRows below, which may ignore the hierarchy entirely.
    for (const l of m.values()) l.sort((a, b) => a.led_sort_order - b.led_sort_order);
    return m;
  }, [live]);

  const root = live.find((r) => r.led_depth === 1) ?? null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => { if (ready) saveSet(slug, 'collapsed', collapsed); }, [ready, slug, collapsed]);
  useEffect(() => {
    if (ready) saveRecord(slug, 'timeline', { mode, zoom, sort, descending });
  }, [ready, slug, mode, zoom, sort, descending]);
  useEffect(() => {
    if (ready) saveRecord(slug, 'timeline-filter', filterTerms);
  }, [ready, slug, filterTerms]);

  /** The modules, in filed order — the module column's choices and its hues. */
  const topRows = useMemo(
    () => byParent.get(root?.led_node_id ?? null) ?? [],
    [byParent, root],
  );

  const filterColumns = useMemo(
    () => filterColumnsFrom(
      fields,
      people,
      topRows.map((m) => ({ id: m.led_node_id, name: m.led_name })),
      statusFieldId,
    ),
    [fields, people, topRows, statusFieldId],
  );

  /* A term naming an archived field or a deleted option is dropped rather than
     obeyed: the terms are saved in this browser and outlive the schema. */
  const activeFilter = useMemo(
    () => liveTerms(filterTerms, filterColumns),
    [filterTerms, filterColumns],
  );
  const filtersActive = Boolean(query.trim() || activeFilter.length > 0);

  const flat = sort !== 'tree' || filtersActive;

  /** Which module each row belongs to, by id — what the module column reads. */
  const moduleIdOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const top of topRows) {
      const mark = (n: LedgerRow) => {
        m.set(n.led_node_id, top.led_node_id);
        for (const k of byParent.get(n.led_node_id) ?? []) mark(k);
      };
      mark(top);
    }
    return m;
  }, [byParent, topRows]);

  const visible = useMemo(
    () => orderRows(live, sort, descending, {
      rootId: root?.led_node_id ?? null,
      collapsed: filtersActive ? new Set<string>() : collapsed,
    }).filter((r) => {
      if (query.trim() && !r.led_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
      return rowMatches(r, activeFilter, filterColumns, moduleIdOf);
    }),
    [live, sort, descending, root, collapsed, filtersActive, query, activeFilter, filterColumns, moduleIdOf],
  );

  /** Which module a row belongs to. In a flat run the tree no longer says. */
  const moduleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const top of byParent.get(root?.led_node_id ?? null) ?? []) {
      const mark = (n: LedgerRow) => {
        m.set(n.led_node_id, top.led_name);
        for (const k of byParent.get(n.led_node_id) ?? []) mark(k);
      };
      mark(top);
    }
    return m;
  }, [byParent, root]);

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

  /* --------------------------------------------------------------- drag */

  const [drag, setDrag] = useState<{
    nodeId: string;
    kind: 'est' | 'act';
    edge: 'move' | 'start' | 'end';
    offsetDays: number;
    origin: { s: string | null; e: string | null };
  } | null>(null);

  const onPointerDown = (
    e: React.PointerEvent,
    row: LedgerRow,
    kind: 'est' | 'act',
    edge: 'move' | 'start' | 'end',
  ) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(row.led_node_id);
    setDrag({
      nodeId: row.led_node_id,
      kind,
      edge,
      offsetDays: 0,
      origin: kind === 'est'
        ? { s: row.led_estimate_start, e: row.led_estimate_end }
        : { s: row.led_actual_start, e: row.led_actual_end },
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dayAt = Math.round((e.clientX - rect.left) / dayW);
    const anchor = drag.edge === 'end' ? drag.origin.e : drag.origin.s;
    if (!anchor) return;
    // 1:1 with the pointer, no smoothing — the one place continuous motion lives.
    setDrag({ ...drag, offsetDays: dayAt - diffDays(start, anchor) });
  };

  const onPointerUp = async () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.offsetDays) return;

    const shifted = shift(d.origin, d.edge, d.offsetDays);
    if (!shifted) return;

    const body =
      d.kind === 'est'
        ? { estimateStart: shifted.s, estimateEnd: shifted.e }
        : { actualStart: shifted.s, actualEnd: shifted.e };

    const before = live;
    setFailure(null);
    try {
      const res = await fetch(`/api/nodes/${d.nodeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setLive(before);
        setFailure(err.message ?? 'The change did not save.');
        return;
      }
      const fresh = (await res.json()) as LedgerRow;
      setLive((rs) => rs.map((r) => (r.led_node_id === fresh.led_node_id ? fresh : r)));
    } catch {
      setLive(before);
      setFailure('No connection. The change did not save.');
    }
  };

  /**
   * The roll-up a parent should show *right now*, with any in-flight drag
   * applied. Without this the overhang only appears after the write lands, so
   * you learn that a drag broke a commitment one moment too late to stop.
   */
  const liveRollup = useCallback(
    (parent: LedgerRow): { s: string | null; e: string | null } => {
      const stored = { s: parent.led_rollup_est_start, e: parent.led_rollup_est_end };
      if (!drag || drag.kind !== 'est') return stored;

      const shifted = shift(drag.origin, drag.edge, drag.offsetDays);
      if (!shifted) return stored;

      let touched = false;
      let min: string | null = null;
      let max: string | null = null;

      const walk = (id: string) => {
        for (const kid of byParent.get(id) ?? []) {
          const isDragged = kid.led_node_id === drag.nodeId;
          if (isDragged) touched = true;
          const s = isDragged ? shifted.s : kid.led_estimate_start;
          const e = isDragged ? shifted.e : kid.led_estimate_end;
          if (s && (!min || s < min)) min = s;
          if (e && (!max || e > max)) max = e;
          walk(kid.led_node_id);
        }
      };
      walk(parent.led_node_id);

      return touched ? { s: min, e: max } : stored;
    },
    [drag, byParent],
  );

  /* --------------------------------------------------------- keyboard */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `[` and `]` are ordinary characters in a project name, and the head
      // now holds a field somebody can type one into. Without this, renaming a
      // project to "Dev.JO [v2]" would nudge the selected bar by two days.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (!canEdit || !selected) return;
      if (e.key !== '[' && e.key !== ']') return;
      const row = live.find((r) => r.led_node_id === selected);
      if (!row) return;

      e.preventDefault();
      const step = e.shiftKey ? 7 : 1;
      const onActual = e.altKey;
      const origin = onActual
        ? { s: row.led_actual_start, e: row.led_actual_end }
        : { s: row.led_estimate_start, e: row.led_estimate_end };
      const next = shift(origin, e.key === '[' ? 'start' : 'end', step);
      if (!next) return;

      void fetch(`/api/nodes/${selected}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          onActual ? { actualStart: next.s, actualEnd: next.e } : { estimateStart: next.s, estimateEnd: next.e },
        ),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((fresh: LedgerRow | null) => {
          if (fresh) setLive((rs) => rs.map((r) => (r.led_node_id === fresh.led_node_id ? fresh : r)));
        });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, live, canEdit]);

  /* --------------------------------------------------------------- view */

  return (
    <div className="book">
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
            <a href={siblingHref(`/p/${slug}`, selected)}>List</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <span aria-current="page">Timeline</span>
            <a href={`/p/${slug}/docs`}>Docs</a>
          </div>
        </header>

        <div className="toolbar label">
          {/* The field is a year either side of today — about 19,000px at day
              zoom — and the view opens centred on today. Until now that was
              the only time it was ever centred there: scroll a month out to
              read a run and the way back was to drag the bar by eye. A datum
              you cannot return to is not a datum. */}
          <button className="today-jump label" onClick={scrollToToday}>Today</button>
          <div className="seg">
            {(['est', 'act', 'both'] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'est' ? 'Estimate' : m === 'act' ? 'Actual' : 'Both'}
              </button>
            ))}
          </div>
          <div className="seg">
            {(['day', 'week', 'month'] as Zoom[]).map((z) => (
              <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                {z[0]!.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="sortbox">
            Sort
            <select
              className="field-input"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              title={SORTS.find((s) => s.key === sort)?.hint}
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {sort !== 'tree' && (
            <button
              className="label flip"
              onClick={() => setDescending((d) => !d)}
              title="Reverse the order. Rows with nothing to sort on stay last either way."
            >
              {descending ? '↓' : '↑'}
            </button>
          )}
          <span>{visible.length} rows</span>
          {!canEdit && <span>· read only</span>}
          {canEdit && !wideEnough && <span>· dragging needs a wider screen</span>}
        </div>

        {failure && <div className="errata">{failure}</div>}

        <div className="timeline-filters" role="search" aria-label="Filter timeline tasks">
          <label>Task name
            <input className="search" type="search" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {/* One menu rather than a row of single-choice selects: status,
              assignee and module are all sets now, and several values in one
              of them widen the answer instead of replacing it. */}
          <FilterMenu
            columns={filterColumns}
            terms={filterTerms}
            onChange={setFilterTerms}
            matching={visible.length}
          />
          {filtersActive && (
            <button type="button" onClick={() => { setQuery(''); setFilterTerms([]); }}>
              Clear filters
            </button>
          )}
          <span role="status">{visible.length} matching rows</span>
        </div>
        {filtersActive && visible.length === 0 && <p className="tl-empty">No tasks match these filters. Try another search or clear the filters.</p>}

        {live.every((r) => !r.led_estimate_end && !r.led_actual_end) && (
          // The scale still draws. A timeline with no bars is a blank ruled
          // page, not an empty screen — the instrument is present, the
          // measurements are not.
          <p className="tl-empty">
            Nothing is dated yet. Give a task an estimate and it appears here.
          </p>
        )}

        <div className="scroller" ref={scrollerRef}>
          <div className={`tl${mode === 'both' ? ' tl-both' : ''}`}>
            <div className="tl-names">
              <div className="tl-head"><div className="tl-months label" style={{ paddingLeft: 10 }}>Name</div></div>
              <div className="tl-days" />
              {visible.map((r) => (
                <div
                  key={r.led_node_id}
                  className={`tl-namerow${r.led_depth === 2 ? ' module' : ''}`}
                  aria-selected={selected === r.led_node_id}
                  /* DESIGN.md § Colors rule 3 puts the module hue on the
                     fore-edge tab, a chip at the head of the module's row, a
                     hairline down the indent of every row beneath it, and both
                     Timeline bars. The List got all four; here only the bars
                     had it, so the name column — the half of this view you
                     actually read names in — was the one surface still unable
                     to say what a row belongs to. Same hue, same index, same
                     3px chip and 2px hairline as the List: a module keeps its
                     colour across both views, which is the whole point of
                     assigning it by filed position rather than per view. */
                  style={{ ['--row-hue' as string]: TAB_HUE(moduleIndex.get(r.led_node_id) ?? 1) }}
                  onClick={() => setSelected(r.led_node_id)}
                >
                  {/* The module's chip became the block's full-height spine in
                      timeline.css; drawing both would state the same hue twice
                      in the same 14px. */}
                  {!flat && <span style={{ paddingLeft: (r.led_depth - 2) * 16 }} />}
                  {!flat && (byParent.get(r.led_node_id) ?? []).length > 0 && (
                    <button
                      className="twist"
                      aria-expanded={!collapsed.has(r.led_node_id)}
                      aria-label="Toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(r.led_node_id)) n.delete(r.led_node_id); else n.add(r.led_node_id);
                          return n;
                        });
                      }}
                    />
                  )}
                  <span className="name-text" lang={/[฀-๿]/.test(r.led_name) ? 'th' : 'en'}>{r.led_name}</span>
                  {mode === 'both' && (
                    <span className="tl-lane-labels">
                      <span>{r.led_depth === 2 ? 'Baseline' : 'Estimate'}</span>
                      <span>{r.led_depth === 2 ? 'Roll-up' : 'Actual'}</span>
                    </span>
                  )}
                  {/* Flattening throws away the one thing the indent was
                      saying. Without this a task name stands alone with no
                      indication of what it belongs to. */}
                  {flat && r.led_depth > 2 && (
                    <span
                      className="rowmodule"
                      lang={/[฀-๿]/.test(moduleOf.get(r.led_node_id) ?? '') ? 'th' : 'en'}
                    >
                      {moduleOf.get(r.led_node_id)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div
              className="tl-field"
              style={{ width }}
              onPointerMove={onPointerMove}
              onPointerUp={() => void onPointerUp()}
              onPointerCancel={() => setDrag(null)}
            >
              <div className="tl-head">
                <div className="tl-months label">{monthHeader(dayList, dayW)}</div>
              </div>
              <div className="tl-days label">
                {dayList.map((iso) => (
                  <div
                    key={iso}
                    /* Today's own number reads in datum ink. The vertical rule
                       already marks the column, but it is 1px in a field of
                       730 of them and the cap sits above the numbers rather
                       than among them — so the one date you scan the scale
                       for was the one date the scale did not distinguish. */
                    className={[
                      'tl-day',
                      isOff(iso) && dayW >= 20 ? 'off' : '',
                      iso === today ? 'is-today' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ width: dayW }}
                  >
                    {dayW >= 20 ? Number(iso.slice(8)) : ''}
                  </div>
                ))}
                <div className="datum-cap label" style={{ left: x(today) + dayW / 2 }}>Today</div>
              </div>

              <div className="tl-rows">
                {/* The period grid. The month band above states the boundary
                    once; without it continued down the field a bar six months
                    out is measured by counting, which is what the scale is
                    for. Drawn first so everything else sits over it. */}
                {monthEdges(dayList, dayW).map((left) => (
                  <div key={left} className="tl-mrule" style={{ left }} />
                ))}
                {dayW >= 20 &&
                  dayList.map((iso) =>
                    isOff(iso) ? (
                      <div key={iso} className="band" style={{ left: x(iso), width: dayW }} />
                    ) : null,
                  )}
                <div className="datum" style={{ left: x(today) + dayW / 2 }} />

                {visible.map((r) => (
                  <Row
                    key={r.led_node_id}
                    row={r}
                    mode={mode}
                    dayW={dayW}
                    x={x}
                    hue={TAB_HUE(moduleIndex.get(r.led_node_id) ?? 1)}
                    canEdit={draggable}
                    drag={drag?.nodeId === r.led_node_id ? drag : null}
                    liveRollup={liveRollup}
                    onPointerDown={onPointerDown}
                    onSelect={() => setSelected(r.led_node_id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== row */

function Row({
  row, mode, dayW, x, hue, canEdit, drag, liveRollup, onPointerDown, onSelect,
}: {
  row: LedgerRow;
  mode: Mode;
  dayW: number;
  x: (iso: string) => number;
  hue: string;
  canEdit: boolean;
  drag: { kind: 'est' | 'act'; edge: 'move' | 'start' | 'end'; offsetDays: number; origin: { s: string | null; e: string | null } } | null;
  liveRollup: (parent: LedgerRow) => { s: string | null; e: string | null };
  onPointerDown: (e: React.PointerEvent, row: LedgerRow, kind: 'est' | 'act', edge: 'move' | 'start' | 'end') => void;
  onSelect: () => void;
}) {
  const isModule = row.led_depth === 2;

  const est = drag?.kind === 'est'
    ? shift(drag.origin, drag.edge, drag.offsetDays) ?? { s: row.led_estimate_start, e: row.led_estimate_end }
    : { s: row.led_estimate_start, e: row.led_estimate_end };

  const act = drag?.kind === 'act'
    ? shift(drag.origin, drag.edge, drag.offsetDays) ?? { s: row.led_actual_start, e: row.led_actual_end }
    : { s: row.led_actual_start, e: row.led_actual_end };

  const bar = (s: string | null, e: string | null) =>
    s && e ? { left: x(s), width: Math.max(dayW, (diffDays(s, e) + 1) * dayW) } : null;

  const estBox = bar(est.s, est.e);
  const actBox = bar(act.s, act.e);

  return (
    /* The hue is set once on the row so both bars, both leading edges and a
       milestone diamond all read the same module colour without being passed
       it individually. */
    <div
      className={`tl-row${isModule ? ' module' : ''}`}
      style={{ ['--bar-hue' as string]: hue }}
      onPointerDown={onSelect}
    >
      {isModule ? (
        <ParentBrackets row={row} x={x} dayW={dayW} rollup={liveRollup(row)} />
      ) : (
        <>
          {mode !== 'act' && estBox && (
            <div
              className={`bar est${canEdit ? ' draggable' : ''}${drag?.kind === 'est' ? ' dragging' : ''}`}
              style={estBox}
              onPointerDown={(e) => onPointerDown(e, row, 'est', 'move')}
            >
              <span className="lead" />
              {canEdit && <span className="handle start" onPointerDown={(e) => onPointerDown(e, row, 'est', 'start')} />}
              {canEdit && <span className="handle end" onPointerDown={(e) => onPointerDown(e, row, 'est', 'end')} />}
            </div>
          )}
          {mode !== 'act' && !estBox && row.led_estimate_end && (
            <div className="mile" style={{ left: x(row.led_estimate_end) }} />
          )}

          {mode !== 'est' && actBox && (
            <div
              className={`bar act${canEdit ? ' draggable' : ''}${drag?.kind === 'act' ? ' dragging' : ''}`}
              style={actBox}
              onPointerDown={(e) => onPointerDown(e, row, 'act', 'move')}
            >
              <span className="lead" />
              {canEdit && <span className="handle start" onPointerDown={(e) => onPointerDown(e, row, 'act', 'start')} />}
              {canEdit && <span className="handle end" onPointerDown={(e) => onPointerDown(e, row, 'act', 'end')} />}
            </div>
          )}
          {mode !== 'est' && !actBox && row.led_actual_end && (
            <div className="mile act" style={{ left: x(row.led_actual_end) }} />
          )}

          {/* the original position, held until release, so the size of the change shows */}
          {drag && (
            <>
              {(() => {
                const g = bar(drag.origin.s, drag.origin.e);
                return g ? (
                  <div className="ghost" style={{ ...g, top: mode === 'both' ? (drag.kind === 'est' ? 3 : 19) : (drag.kind === 'est' ? 5 : 20), height: 9 }} />
                ) : null;
              })()}
              {(drag.kind === 'est' ? est : act).s && (
                <span className="drag-dates" style={{ left: x((drag.kind === 'est' ? est : act).s!) }}>
                  {(drag.kind === 'est' ? est : act).s} → {(drag.kind === 'est' ? est : act).e}
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A parent carries brackets, not bars: its own baseline above (D-21) and its
 * children's computed roll-up below (D-20). Where the roll-up runs past the
 * baseline, that overhang alone is vermilion.
 */
function ParentBrackets({
  row, x, dayW, rollup,
}: {
  row: LedgerRow;
  x: (iso: string) => number;
  dayW: number;
  rollup: { s: string | null; e: string | null };
}) {
  const bs = row.led_estimate_start;
  const be = row.led_estimate_end;
  const rs = rollup.s;
  const re = rollup.e;

  return (
    <>
      {bs && be && (
        <div className="brk base" style={{ left: x(bs), width: Math.max(dayW, (diffDays(bs, be) + 1) * dayW) }} />
      )}
      {rs && re && (
        <>
          <div
            className="brk roll"
            style={{ left: x(rs), width: Math.max(dayW, (diffDays(rs, be && be < re ? be : re) + 1) * dayW) }}
          />
          {be && re > be && (
            <>
              <div className="brk over" style={{ left: x(be), width: (diffDays(be, re)) * dayW }} />
              <span className="over-fig" style={{ left: x(re) + dayW }}>out of closure</span>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------- helpers */

function shift(
  origin: { s: string | null; e: string | null },
  edge: 'move' | 'start' | 'end',
  days: number,
): { s: string | null; e: string | null } | null {
  if (!days) return origin;
  if (edge === 'move') {
    if (!origin.s || !origin.e) return null;
    return { s: addDays(origin.s, days), e: addDays(origin.e, days) };
  }
  if (edge === 'start') {
    if (!origin.s) return null;
    const s = addDays(origin.s, days);
    return { s, e: origin.e && origin.e < s ? s : origin.e };
  }
  if (!origin.e) return null;
  const e = addDays(origin.e, days);
  return { s: origin.s && origin.s > e ? e : origin.s, e };
}

/**
 * The x of every month boundary, in the same coordinates the header labels
 * use. One walk, so the rule down the field and the label above it can never
 * disagree about where a month starts.
 */
function monthEdges(days: string[], dayW: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < days.length; i++) {
    if (days[i]!.slice(0, 7) !== days[i - 1]!.slice(0, 7)) out.push(i * dayW);
  }
  return out;
}

function monthHeader(days: string[], dayW: number) {
  const out: React.ReactElement[] = [];
  let i = 0;
  while (i < days.length) {
    const month = days[i]!.slice(0, 7);
    let n = 0;
    while (i + n < days.length && days[i + n]!.slice(0, 7) === month) n++;
    const [y, m] = month.split('-');
    out.push(
      <div key={month} className="tl-month label" style={{ width: n * dayW }}>
        {MONTHS[Number(m) - 1]} {y}
      </div>,
    );
    i += n;
  }
  return out;
}
