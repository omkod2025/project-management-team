import type { LedgerRow } from '@/db/schema';

export type CalendarMode = 'estimate' | 'actual' | 'both';
export type CalendarEntry = { id: string; row: LedgerRow; kind: 'estimate' | 'actual'; start: string; end: string; partial: boolean };
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const dateFrom = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso: string, count: number) => isoDate(new Date(dateFrom(iso).getTime() + count * 86400000));
export const dayDiff = (a: string, b: string) => Math.round((dateFrom(b).getTime() - dateFrom(a).getTime()) / 86400000);
export function monthDays(anchor: string): string[] {
  const first = `${anchor.slice(0, 7)}-01`;
  const date = dateFrom(first);
  const count = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = date.getUTCDay();
  const start = addDays(first, -offset);
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => addDays(start, i));
}
export function shiftMonth(anchor: string, offset: number): string {
  const d = dateFrom(anchor);
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)));
}
/** Only entered/captured dates are plotted. A missing counterpart is never borrowed. */
export function calendarEntries(rows: LedgerRow[], mode: CalendarMode): CalendarEntry[] {
  return rows.filter(r => r.led_depth > 1).flatMap(row => {
    const entries: CalendarEntry[] = [];
    for (const kind of ['estimate', 'actual'] as const) {
      if (mode !== 'both' && mode !== kind) continue;
      const start = kind === 'estimate' ? row.led_estimate_start : row.led_actual_start;
      const end = kind === 'estimate' ? row.led_estimate_end : row.led_actual_end;
      if (!start && !end) continue;
      // A single known boundary is a marker, not an invented open-ended interval.
      entries.push({ id: `${row.led_node_id}:${kind}`, row, kind, start: start ?? end!, end: end ?? start!, partial: !start || !end });
    }
    return entries;
  });
}
export type WeekEntry = { entry: CalendarEntry; column: number; span: number; lane: number; continuesBefore: boolean; continuesAfter: boolean };
/** Pack inclusive ranges once per week, keeping overlapping estimate/actual bars distinct. */
export function packWeek(entries: CalendarEntry[], start: string): WeekEntry[] {
  const end = addDays(start, 6);
  const candidates = entries.filter(e => e.start <= end && e.end >= start)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.row.led_name.localeCompare(b.row.led_name) || a.id.localeCompare(b.id));
  const occupied: number[] = [];
  return candidates.map(entry => {
    const column = Math.max(0, dayDiff(start, entry.start));
    const last = Math.min(6, dayDiff(start, entry.end));
    let lane = occupied.findIndex(until => until < column);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = last;
    return { entry, column, span: last - column + 1, lane, continuesBefore: entry.start < start, continuesAfter: entry.end > end };
  });
}
