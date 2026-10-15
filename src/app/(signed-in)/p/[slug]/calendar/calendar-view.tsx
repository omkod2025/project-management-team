'use client';

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { LedgerRow } from '@/db/schema';
import Bell from '../../../bell';
import TaskModal from '../../../timeline/task-modal';
import { selectedFromUrl, siblingHref, writeSelectedToUrl, loadRecord, saveRecord } from '../view-state';
import { addDays, calendarEntries, dateFrom, monthDays, packWeek, shiftMonth, type CalendarEntry, type CalendarMode } from './calendar-model';
import '../../../timeline/roster.css';
import './calendar.css';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatMonth = (iso: string) => dateFrom(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFrom(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hue = (index: number) => ['#3f6499', '#35786c', '#8b65a0', '#947029', '#417d8c', '#826955'][index % 6]!;

export default function CalendarView({ projectName, slug, rows, holidays, today }: {
  projectName: string; slug: string; rows: LedgerRow[]; holidays: string[]; today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [anchor, setAnchor] = useState(today);
  const [mode, setMode] = useState<CalendarMode>('both');
  const [view, setView] = useState<'month' | 'week'>('month');
  const [query, setQuery] = useState('');
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false);
    const saved = loadRecord<{ mode?: CalendarMode; view?: 'month' | 'week' }>(slug, 'calendar', {});
    if (saved.mode && ['estimate', 'actual', 'both'].includes(saved.mode)) setMode(saved.mode);
    if (saved.view === 'month' || saved.view === 'week') setView(saved.view);
    const id = selectedFromUrl();
    const row = rows.find(r => r.led_node_id === id);
    if (row) {
      setSelected(id);
      setAnchor(row.led_estimate_start ?? row.led_actual_start ?? row.led_estimate_end ?? row.led_actual_end ?? today);
    }
    setReady(true);
    // Only restore on project entry, not after a refreshed ledger arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  useEffect(() => { if (ready) saveRecord(slug, 'calendar', { mode, view }); }, [slug, mode, view, ready]);
  useEffect(() => { if (ready) writeSelectedToUrl(selected); }, [selected, ready]);
  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [router]);

  const modules = useMemo(() => rows.filter(r => r.led_depth === 2).sort((a, b) => a.led_sort_order - b.led_sort_order), [rows]);
  const moduleByNode = useMemo(() => {
    const byId = new Map(rows.map(r => [r.led_node_id, r]));
    return new Map(rows.map(row => {
      let current = row;
      const seen = new Set<string>();
      while (current.led_depth > 2 && current.led_parent_id && !seen.has(current.led_node_id)) {
        seen.add(current.led_node_id);
        const parent = byId.get(current.led_parent_id);
        if (!parent) break;
        current = parent;
      }
      return [row.led_node_id, current.led_node_id];
    }));
  }, [rows]);
  const filteredRows = useMemo(() => rows.filter(r => r.led_depth > 1 &&
    !hiddenModules.includes(moduleByNode.get(r.led_node_id) ?? '') &&
    r.led_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [rows, hiddenModules, moduleByNode, query]);
  const entries = useMemo(() => calendarEntries(filteredRows, mode), [filteredRows, mode]);
  const unscheduled = useMemo(() => {
    const dated = new Set(entries.map(e => e.row.led_node_id));
    return filteredRows.filter(r => !dated.has(r.led_node_id));
  }, [entries, filteredRows]);
  const miniDays = monthDays(anchor);
  const days = view === 'month' ? miniDays : Array.from({ length: 7 }, (_, i) => addDays(anchor, i - dateFrom(anchor).getUTCDay()));
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const inWindow = entries.filter(e => e.start <= days.at(-1)! && e.end >= days[0]!);
  const visibleTasks = new Set(inWindow.map(e => e.row.led_node_id)).size;
  const holidaySet = new Set(holidays);
  const moduleColor = (row: LedgerRow) => hue(Math.max(0, modules.findIndex(m => m.led_node_id === moduleByNode.get(row.led_node_id))));
  const openTask = (id: string) => setSelected(id);
  const step = (direction: number) => { setAnchor(view === 'month' ? shiftMonth(anchor, direction) : addDays(anchor, direction * 7)); setAgenda(null); };
  const agendaEntries = agenda && agenda !== 'unscheduled' ? entries.filter(e => e.start <= agenda && e.end >= agenda) : [];

  function EventButton({ entry, compact = false }: { entry: CalendarEntry; compact?: boolean }) {
    return <button type="button" className={`cal-event ${entry.kind}${compact ? ' compact' : ''}`}
      style={{ '--event-color': moduleColor(entry.row) } as CSSProperties}
      data-node={entry.row.led_node_id} data-kind={entry.kind}
      onClick={() => openTask(entry.row.led_node_id)}
      aria-label={`${entry.kind === 'estimate' ? 'Estimate' : 'Actual'}: ${entry.row.led_name}, ${formatDate(entry.start)}${entry.start !== entry.end ? ` – ${formatDate(entry.end)}` : ''}${entry.partial ? ', one date recorded' : ''}`}
      title={`${entry.row.led_name}\n${entry.kind}: ${entry.start} → ${entry.end}${entry.partial ? ' (one date recorded)' : ''}`}>
      <span className="cal-kind">{entry.kind === 'estimate' ? 'E' : 'A'}</span><span className="cal-event-name">{entry.row.led_name}</span>{entry.partial && <span aria-hidden="true">◦</span>}
    </button>;
  }

  return <div className="cal-page">
    <header className="cal-header">
      <button className="cal-icon" aria-label="Toggle calendar sidebar" aria-expanded={sidebar} onClick={() => setSidebar(v => !v)}>☰</button>
      <div className="cal-logo" aria-hidden="true"><span>CAL</span>{today.slice(8)}</div>
      <div className="cal-heading"><h1>Calendar</h1><span>{projectName}</span></div>
      <nav aria-label="Project views" className="cal-project-nav">
        <a href="/">Home</a><a href={siblingHref(`/p/${slug}`, selected)}>List</a>
        <a href={siblingHref(`/p/${slug}/timeline`, selected)}>Timeline</a><span aria-current="page">Calendar</span>
        <a href={`/p/${slug}/docs`}>Docs</a>
      </nav><Bell />
    </header>
    <div className={`cal-layout${sidebar ? '' : ' no-sidebar'}`}>
      {sidebar && <aside className="cal-sidebar" aria-label="Calendar filters">
        <div className="cal-mini-head"><strong>{formatMonth(anchor)}</strong><button aria-label="Previous mini month" onClick={() => setAnchor(shiftMonth(anchor, -1))}>‹</button><button aria-label="Next mini month" onClick={() => setAnchor(shiftMonth(anchor, 1))}>›</button></div>
        <div className="cal-mini" aria-label="Navigation calendar">
          {weekdays.map(day => <span className="cal-mini-weekday" key={day}>{day[0]}</span>)}
          {miniDays.map(day => <button key={day} className={`${day.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''} ${day === today ? 'today' : ''}`} aria-label={formatDate(day)} aria-pressed={day === anchor}
            onClick={() => { setAnchor(day); setAgenda(day); }}>{Number(day.slice(8))}</button>)}
        </div>
        <h2>Schedules</h2>
        <p className="cal-legend"><span className="cal-swatch estimate" />Estimate <small>Planned dates</small></p>
        <p className="cal-legend"><span className="cal-swatch actual" />Actual <small>Recorded dates</small></p>
        <h2>Modules <button onClick={() => setHiddenModules([])}>Show all</button></h2>
        <div className="cal-module-list">{modules.map((module, index) => <label key={module.led_node_id}>
          <input type="checkbox" checked={!hiddenModules.includes(module.led_node_id)} style={{ accentColor: hue(index) }}
            onChange={e => setHiddenModules(prev => e.target.checked ? prev.filter(id => id !== module.led_node_id) : [...prev, module.led_node_id])} />
          <span>{module.led_name}</span>
        </label>)}</div>
        <button className="cal-unscheduled" onClick={() => setAgenda('unscheduled')}>Unscheduled <span>{unscheduled.length}</span></button>
        <p className="cal-note">Dates are shared with List and Timeline. Open a task to compare or edit its schedule.</p>
      </aside>}
      <main className="cal-main" aria-label="Project calendar" aria-busy={pending}>
        <div className="cal-toolbar">
          <button className="cal-today" onClick={() => { setAnchor(today); setAgenda(null); }}>Today</button>
          <div className="cal-arrows"><button aria-label={`Previous ${view}`} onClick={() => step(-1)}>‹</button><button aria-label={`Next ${view}`} onClick={() => step(1)}>›</button></div>
          <h2>{view === 'month' ? formatMonth(anchor) : `${formatDate(days[0]!)} – ${formatDate(days[6]!)}`}</h2>
          <label className="cal-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search calendar tasks" placeholder="Search tasks" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <select aria-label="Calendar view" value={view} onChange={e => setView(e.target.value as 'month' | 'week')}><option value="month">Month</option><option value="week">Week</option></select>
        </div>
        <div className="cal-subtoolbar">
          <div className="cal-mode" role="group" aria-label="Schedule dates">{(['estimate', 'actual', 'both'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'estimate' ? 'Estimate' : value === 'actual' ? 'Actual' : 'Both'}</button>)}</div>
          <span role="status">{pending ? 'Refreshing…' : `${visibleTasks} tasks · ${inWindow.length} schedules`}</span>
          <button className="cal-refresh" onClick={() => startTransition(() => router.refresh())} disabled={pending}>Refresh</button>
        </div>
        {inWindow.length === 0 && <p className="cal-empty" role="status">No {mode === 'both' ? '' : `${mode} `}dates in this {view}. Change the period or filters, or open Unscheduled.</p>}
        <div className="cal-scroll">
          <div className={`cal-grid ${view}`} role="grid" aria-label={`${formatMonth(anchor)} calendar`}>
            <div className="cal-weekdays" role="row">{weekdays.map(day => <div role="columnheader" key={day}>{day}</div>)}</div>
            {weeks.map(week => {
              const packed = packWeek(entries, week[0]!);
              const maxLanes = view === 'month' ? 3 : 12;
              const shown = packed.filter(p => p.lane < maxLanes);
              return <div className="cal-week" role="row" key={week[0]} style={{ '--lanes': view === 'month' ? 3 : Math.max(3, Math.min(12, packed.length)) } as CSSProperties}>
                <div className="cal-days">{week.map((day, index) => {
                  const overflow = packed.filter(p => p.lane >= maxLanes && p.column <= index && p.column + p.span > index).length;
                  return <div role="gridcell" aria-label={formatDate(day)} key={day} className={`cal-day${day.slice(0, 7) !== anchor.slice(0, 7) ? ' outside' : ''}${holidaySet.has(day) ? ' holiday' : ''}`}>
                    <button className={`cal-day-number${day === today ? ' today' : ''}`} aria-label={`View tasks on ${formatDate(day)}`} onClick={() => setAgenda(day)}>{Number(day.slice(8))}</button>
                    {holidaySet.has(day) && <span className="cal-holiday">Holiday</span>}
                    {overflow > 0 && <button className="cal-more" onClick={() => setAgenda(day)} aria-label={`${overflow} more schedules on ${formatDate(day)}`}>+{overflow} more</button>}
                  </div>;
                })}</div>
                <div className="cal-bars">{shown.map(p => <div className={`cal-bar-slot${p.continuesBefore ? ' continues-before' : ''}${p.continuesAfter ? ' continues-after' : ''}`} key={p.entry.id} style={{ gridColumn: `${p.column + 1} / span ${p.span}`, gridRow: p.lane + 1 }}><EventButton entry={p.entry} compact /></div>)}</div>
              </div>;
            })}
          </div>
        </div>
        <footer className="cal-footer"><span><b>E</b> Estimate · <b>A</b> Actual · ◦ One date recorded</span><span>Asia/Bangkok · All-day schedules</span></footer>
      </main>
      {agenda && <aside className="cal-agenda" aria-label="Day schedules"><div className="cal-agenda-head"><h2>{agenda === 'unscheduled' ? 'Unscheduled' : formatDate(agenda)}</h2><button aria-label="Close day schedules" onClick={() => setAgenda(null)}>×</button></div>
        <p>{agenda === 'unscheduled' ? `No ${mode === 'both' ? 'estimate or actual' : mode} dates recorded.` : `${agendaEntries.length} schedules`}</p>
        {agenda === 'unscheduled' ? unscheduled.map(row => <button className="cal-undated-task" key={row.led_node_id} onClick={() => openTask(row.led_node_id)}>{row.led_name}<small>Open task →</small></button>) : agendaEntries.map(entry => <div className="cal-agenda-entry" key={entry.id}><EventButton entry={entry} /><small>{entry.kind === 'estimate' ? 'Estimate' : 'Actual'} · {formatDate(entry.start)}{entry.start !== entry.end ? ` – ${formatDate(entry.end)}` : ''}{entry.partial ? ' · One date recorded' : ''}</small></div>)}
        {(agenda === 'unscheduled' ? unscheduled.length : agendaEntries.length) === 0 && <p className="cal-note">No tasks to show.</p>}
      </aside>}
    </div>
    {selected && <TaskModal key={selected} nodeId={selected} onClose={() => setSelected(null)} onSaved={() => {
      // Finish the URL change before refreshing. A later history replacement
      // would supersede the in-flight server response for the old node URL.
      writeSelectedToUrl(null);
      setSelected(null);
      startTransition(() => router.refresh());
    }} />}
  </div>;
}
