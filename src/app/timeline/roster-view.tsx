'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Roster, RosterItem, RosterLane } from '@/lib/roster';
import { loadRecord, saveRecord } from '../p/[slug]/view-state';
import { addDays, contendedRuns, occupancy, pack, span, unpack } from './pack';
import '../p/[slug]/list.css';
import '../p/[slug]/timeline/timeline.css';
import './roster.css';

/**
 * The roster timeline — the shelf's own view (brief 2026-09-08).
 *
 * The project Timeline draws one row per node and answers "did this plan
 * hold?". This draws one row per *person*, across every project they are in,
 * and answers the question that one cannot: who is holding what, and where do
 * their runs collide.
 *
 * Two consequences follow from the row being a person rather than a node, and
 * both are deliberate:
 *
 *   - A lane packs its items into sub-rows, so **the height of a lane is the
 *     amount of work overlapping in it**. Load is read from the shape of the
 *     page before any figure is read.
 *   - Nothing here is draggable. Moving a date on a packed lane would rewrite
 *     a plan without its module beside it, which is exactly the context the
 *     project Timeline exists to supply. This surface reads.
 */

type Zoom = 'day' | 'week' | 'month';
type Mode = 'est' | 'act' | 'both';

const DAY_W: Record<Zoom, number> = { day: 26, week: 12, month: 4 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Sub-rows drawn before a lane is truncated. Past four, the lane stops being
 *  readable as a shape and becomes a wall; the rest is reached by soloing. */
const MAX_LANES = 4;
const SUB_H = 20;
const LANE_PAD = 5;
/** A lane must clear its own two-line name block, however little it holds. */
const MIN_LANE = 42;
/** The unassigned lane is soloable like anyone else; it needs a key to be it by. */
const UNASSIGNED = '_unassigned';
const laneKey = (l: RosterLane) => l.personId ?? UNASSIGNED;
/** How many items must overlap on a day before the lane is marked contended. */
const CONTENTION = 3;

const MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS);
const HUE = (i: number) => `var(--color-tab-${((i - 1) % 6) + 1})`;
const isThai = (s: string) => /[฀-๿]/.test(s);

export default function RosterView({ roster }: { roster: Roster }) {
  const { lanes, projects, holidays } = roster;

  const [zoom, setZoom] = useState<Zoom>('week');
  const [mode, setMode] = useState<Mode>('both');
  /** Empty means the whole party. Non-empty means these people only. */
  const [who, setWho] = useState<Set<string>>(new Set());
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = loadRecord<{ mode?: Mode; zoom?: Zoom; hidden?: string[] }>('_shelf', 'roster', {});
    if (v.mode) setMode(v.mode);
    if (v.zoom) setZoom(v.zoom);
    if (v.hidden) setHiddenProjects(new Set(v.hidden));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveRecord('_shelf', 'roster', { mode, zoom, hidden: [...hiddenProjects] });
  }, [ready, mode, zoom, hiddenProjects]);

  // Escape returns the whole party. Soloing is the primary act on this page,
  // so the way back must not require finding the same name again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWho(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dayW = DAY_W[zoom];
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const today = useMemo(() => toIso(new Date(Date.now() + 7 * 3600 * 1000)), []);
  const solo = who.size > 0;

  /** Project filtering happens before packing: a hidden project must not
   *  reserve a sub-row it no longer draws into. */
  const shown: RosterLane[] = useMemo(() => {
    const kept = lanes.map((l) => ({
      ...l,
      items: l.items.filter((it) => !hiddenProjects.has(it.projectSlug)),
    }));
    return solo ? kept.filter((l) => who.has(laneKey(l))) : kept;
  }, [lanes, hiddenProjects, solo, who]);

  /* ------------------------------------------------------------- window */

  const { start, days } = useMemo(() => {
    const all: string[] = [];
    for (const l of lanes) {
      for (const it of l.items) {
        const sp = span(it);
        if (sp) { all.push(sp.s); all.push(sp.e); }
      }
    }
    all.sort();
    const earliest = all[0] && all[0] < addDays(today, -180) ? all[0] : addDays(today, -180);
    const latest = all.length && all[all.length - 1]! > addDays(today, 365)
      ? all[all.length - 1]!
      : addDays(today, 365);
    const first = addDays(earliest, -7);
    return { start: first, days: diffDays(first, addDays(latest, 7)) + 1 };
  }, [lanes, today]);

  const x = useCallback((iso: string) => diffDays(start, iso) * dayW, [start, dayW]);
  const width = days * dayW;
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);

  const isOff = useCallback(
    (iso: string) => {
      const dow = toDate(iso).getUTCDay();
      return dow === 0 || dow === 6 || holidaySet.has(iso);
    },
    [holidaySet],
  );

  const scrollToToday = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, diffDays(start, today) * dayW - el.clientWidth * 0.35);
  }, [start, dayW, today]);

  useEffect(() => { scrollToToday(); }, [scrollToToday]);

  /* -------------------------------------------------------------- packing */

  /**
   * Packing is what makes a lane's height mean "how much is overlapping here".
   * Soloing asks the opposite question — *what exactly is in this lane* — and
   * there the packing is in the way: two bars sharing a sub-row leave nowhere
   * to write the second one's name. So a soloed lane unpacks to one item per
   * row, which is the project Timeline's shape, reached by a different route.
   */
  const packed = useMemo(
    () => shown.map((l) => ({
      lane: l,
      rows: solo ? unpack(l.items) : pack(l.items, dayW === DAY_W.month ? 3 : 1),
    })),
    [shown, dayW, solo],
  );

  const toggleWho = (id: string, additive: boolean) => {
    setWho((prev) => {
      const next = new Set(additive ? prev : []);
      if (prev.has(id) && (additive || prev.size === 1)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalItems = shown.reduce((n, l) => n + l.items.length, 0);
  const nothingDated = lanes.every((l) => l.items.length === 0);

  return (
    <div className="book">
      <div className="sheet">
        <header className="head">
          <a className="shelf label" href="/">‹ Home</a>
          <h1>Roster</h1>
          <div className="views label">
            <a href="/">Projects</a>
            <span aria-current="page">Roster</span>
            <a href="/people">People</a>
          </div>
        </header>

        <div className="toolbar label">
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

          {/* Hue is let to the project on this page, so the filter that uses it
              has to teach it — the chip is both the key and the switch. */}
          <div className="proj-filter">
            {projects.map((p) => (
              <button
                key={p.slug}
                className="proj-chip"
                style={{ ['--chip-hue' as string]: HUE(p.index) }}
                aria-pressed={!hiddenProjects.has(p.slug)}
                title={p.unassignable ? `${p.name} — no people field defined, so its work lands in Unassigned` : p.name}
                onClick={() =>
                  setHiddenProjects((s) => {
                    const n = new Set(s);
                    if (n.has(p.slug)) n.delete(p.slug); else n.add(p.slug);
                    return n;
                  })
                }
              >
                <span className="proj-dot" />
                <span lang={isThai(p.name) ? 'th' : 'en'}>{p.name}</span>
              </button>
            ))}
          </div>

          <span className="count">{totalItems} dated</span>
          {solo && (
            <button className="clear-who label" onClick={() => setWho(new Set())}>
              Whole party ⎋
            </button>
          )}
        </div>

        {nothingDated && (
          <p className="tl-empty">
            Nobody has dated work yet. Give a task an estimate in a project and the person holding it appears here.
          </p>
        )}

        <div className="scroller" ref={scrollerRef}>
          <div className="tl rs">
            <div className="tl-names rs-names">
              <div className="tl-head"><div className="tl-months label" style={{ paddingLeft: 12 }}>Party</div></div>
              <div className="tl-days" />
              {packed.map(({ lane, rows }) => (
                <div
                  key={laneKey(lane)}
                  className={[
                    'rs-name',
                    solo ? 'tall' : '',
                    lane.personId === null ? 'unassigned' : '',
                    who.has(laneKey(lane)) ? 'soloed' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ height: laneHeight(rows.length, solo) }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={who.has(laneKey(lane))}
                  title={
                    who.has(laneKey(lane))
                      ? 'Click to return to the whole party'
                      : 'Click to read this lane alone — shift-click to add a second'
                  }
                  onClick={(e) => toggleWho(laneKey(lane), e.shiftKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWho(laneKey(lane), e.shiftKey); }
                  }}
                >
                  <span className="rs-person" lang={isThai(lane.personName) ? 'th' : 'en'}>
                    {lane.personName}
                  </span>
                  <span className="rs-tally figure">
                    {lane.items.length}
                    {lane.undatedCount > 0 && <span className="rs-undated"> +{lane.undatedCount} undated</span>}
                  </span>
                  {rows.length > MAX_LANES && !solo && (
                    <span className="rs-more label">+{overflowCount(rows)} more</span>
                  )}
                </div>
              ))}
            </div>

            <div className="tl-field" style={{ width }}>
              <div className="tl-head">
                <div className="tl-months label">{monthHeader(dayList, dayW)}</div>
              </div>
              <div className="tl-days label">
                {dayList.map((iso) => (
                  <div
                    key={iso}
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
                {/* The period grid, same walk and same coordinates as the
                    month labels above. It matters more here than on the
                    project field: this page opens at week zoom, where the day
                    numbers are gone and a month rule is the only scale left. */}
                {monthEdges(dayList, dayW).map((left) => (
                  <div key={left} className="tl-mrule" style={{ left }} />
                ))}
                {dayW >= 20 && dayList.map((iso) => (isOff(iso) ? (
                  <div key={iso} className="band" style={{ left: x(iso), width: dayW }} />
                ) : null))}
                <div className="datum" style={{ left: x(today) + dayW / 2 }} />

                {packed.map(({ lane, rows }) => (
                  <Lane
                    key={laneKey(lane)}
                    lane={lane}
                    rows={rows}
                    mode={mode}
                    solo={solo}
                    dayW={dayW}
                    start={start}
                    days={days}
                    x={x}
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

/* ==================================================================== lane */

function Lane({
  lane, rows, mode, solo, dayW, start, days, x,
}: {
  lane: RosterLane;
  rows: RosterItem[][];
  mode: Mode;
  solo: boolean;
  dayW: number;
  start: string;
  days: number;
  x: (iso: string) => number;
}) {
  const shownRows = solo ? rows : rows.slice(0, MAX_LANES);
  const subH = solo ? 26 : SUB_H;

  /**
   * Days where this person is holding CONTENTION things at once, drawn as a
   * rule along the foot of the lane.
   *
   * Not vermilion, and this is the point: three overlapping tasks is a fact
   * about a schedule, not a measurement that failed its check. Vermilion
   * belongs to misclosure and nothing else (DESIGN.md § Colors rule 1), so
   * contention is stated in graphite and left for a human to judge.
   */
  const contended = useMemo(
    () => contendedRuns(occupancy(lane.items, start, days), CONTENTION),
    [lane.items, start, days],
  );

  return (
    <div className="rs-lane" style={{ height: laneHeight(rows.length, solo) }}>
      {contended.map((r) => (
        <div
          key={r.from}
          className="rs-contended"
          style={{ left: r.from * dayW, width: (r.to - r.from) * dayW }}
          title={`${lane.personName} is holding ${CONTENTION} or more items at once here`}
        />
      ))}

      {shownRows.map((items, i) => (
        <div key={i} className="rs-sub" style={{ top: LANE_PAD + i * subH, height: subH }}>
          {items.map((it) => (
            <Item key={it.nodeId + it.projectSlug} item={it} mode={mode} solo={solo} dayW={dayW} x={x} subH={subH} />
          ))}
        </div>
      ))}

      {/* Sticky rather than placed: on a 550-day field an absolutely positioned
          note is off screen wherever the reader happens to be, and an empty
          lane that says nothing reads as a bug. */}
      {lane.items.length === 0 && (
        <div className="rs-idle label">
          {lane.undatedCount > 0
            ? `${lane.undatedCount} assigned, none dated`
            : 'nothing assigned'}
        </div>
      )}
    </div>
  );
}

/* ==================================================================== item */

function Item({
  item, mode, solo, dayW, x, subH,
}: {
  item: RosterItem;
  mode: Mode;
  solo: boolean;
  dayW: number;
  x: (iso: string) => number;
  subH: number;
}) {
  const bar = (s: string | null, e: string | null) =>
    s && e ? { left: x(s), width: Math.max(dayW, (diffDays(s, e) + 1) * dayW) } : null;

  const estBox = bar(item.estimateStart, item.estimateEnd);
  const actBox = bar(item.actualStart, item.actualEnd);

  // The heights compress on a packed lane but never merge: plan above, record
  // below, hatch against solid, whatever the sub-row height.
  const estH = solo ? 9 : 6;
  const actH = solo ? 13 : 8;
  const estTop = solo ? 2 : 2;
  const actTop = estTop + estH + 2;

  const hue = HUE(item.projectIndex);
  const late = item.misclosureEnd !== null && item.misclosureEnd > 0;

  const title = [
    item.name,
    `${item.projectName}${item.moduleName ? ` · ${item.moduleName}` : ''}`,
    item.estimateStart || item.estimateEnd
      ? `estimate ${item.estimateStart ?? '—'} → ${item.estimateEnd ?? '—'}`
      : 'no estimate',
    item.actualStart || item.actualEnd
      ? `actual ${item.actualStart ?? '—'} → ${item.actualEnd ?? '—'}`
      : 'no actual',
    late ? `misclosure +${item.misclosureEnd}d` : '',
  ].filter(Boolean).join('\n');

  return (
    <a
      className="rs-item"
      href={`/p/${item.projectSlug}?node=${item.nodeId}`}
      title={title}
      style={{ ['--bar-hue' as string]: hue, height: subH }}
    >
      {mode !== 'act' && estBox && (
        <span className="bar est" style={{ ...estBox, top: estTop, height: estH }} >
          <span className="lead" />
        </span>
      )}
      {mode !== 'act' && !estBox && item.estimateEnd && (
        <span className="mile" style={{ left: x(item.estimateEnd), top: estTop, width: estH, height: estH }} />
      )}

      {mode !== 'est' && actBox && (
        <span className={`bar act${late ? ' rs-late' : ''}`} style={{ ...actBox, top: actTop, height: actH }}>
          <span className="lead" />
        </span>
      )}
      {mode !== 'est' && !actBox && item.actualEnd && (
        <span className="mile act" style={{ left: x(item.actualEnd), top: actTop, width: actH, height: actH }} />
      )}

      {/* The name rides beside the bar only when there is a lane's worth of
          room for it. On a packed lane the bar is the whole statement and the
          name is one hover away — a label per bar at 20px sub-rows is the
          thing that turns a readable shape back into a wall of text. */}
      {solo && (
        <span
          className="rs-label"
          style={{ left: labelAnchor(item, x, dayW) }}
          lang={isThai(item.name) ? 'th' : 'en'}
        >
          {item.name}
          <span className="rs-where">{item.projectName}{item.moduleName ? ` · ${item.moduleName}` : ''}</span>
          {late && <span className="rs-slip figure">+{item.misclosureEnd}d</span>}
        </span>
      )}
    </a>
  );
}

/* ------------------------------------------------------------- helpers */

/** Where a soloed item's name starts: just past whichever mark ends furthest right. */
function labelAnchor(it: RosterItem, x: (iso: string) => number, dayW: number): number {
  const ends = [it.estimateEnd, it.actualEnd].filter(Boolean) as string[];
  if (!ends.length) {
    const starts = [it.estimateStart, it.actualStart].filter(Boolean) as string[];
    return starts.length ? x(starts.sort()[0]!) + dayW + 8 : 8;
  }
  return x(ends.sort()[ends.length - 1]!) + dayW + 8;
}

function laneHeight(subRows: number, solo: boolean): number {
  const subH = solo ? 26 : SUB_H;
  const shown = solo ? subRows : Math.min(subRows, MAX_LANES);
  return Math.max(MIN_LANE, Math.max(1, shown) * subH + LANE_PAD * 2);
}

function overflowCount(rows: RosterItem[][]): number {
  return rows.slice(MAX_LANES).reduce((n, r) => n + r.length, 0);
}

/** The x of every month boundary, in the header's own coordinates. */
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
