import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEntries, monthDays, packWeek, shiftMonth } from '../src/app/(signed-in)/p/[slug]/calendar/calendar-model.ts';
import type { LedgerRow } from '../src/db/schema.ts';

const row = (override: Partial<LedgerRow> = {}): LedgerRow => ({
  led_node_id:'task', led_parent_id:'module', led_depth:3, led_name:'Task', led_sort_order:0,
  led_estimate_start:'2026-10-01', led_estimate_end:'2026-10-03', led_actual_start:'2026-10-02', led_actual_end:'2026-10-05',
  led_actual_start_raw:null, led_actual_end_raw:null, led_source_start:null, led_source_end:null, led_custom_values:{},
  led_estimate_workdays:0, led_actual_workdays:0, led_misclosure_start:null, led_misclosure_end:null,
  led_rollup_est_start:null, led_rollup_est_end:null, led_rollup_act_start:null, led_rollup_act_end:null,
  led_out_of_closure:false, led_descendant_count:0, led_closed_count:0, ...override,
});
test('calendar preserves independent estimate and actual ranges in Both', () => {
  const source = row();
  const entries = calendarEntries([source], 'both');
  assert.deepEqual(entries.map(e => [e.kind, e.start, e.end]), [['estimate','2026-10-01','2026-10-03'],['actual','2026-10-02','2026-10-05']]);
  assert.equal(calendarEntries([source], 'actual').length, 1);
  assert.equal(calendarEntries([source], 'estimate')[0]!.end, '2026-10-03');
});
test('missing actual dates never fall back to estimates or descendant rollups', () => {
  assert.deepEqual(calendarEntries([row({led_actual_start:null, led_actual_end:null, led_rollup_act_start:'2026-10-01'})], 'actual'), []);
});
test('one boundary is a single-day marker and leaves source dates untouched', () => {
  const source = row({led_actual_start:null});
  const [entry] = calendarEntries([source], 'actual');
  assert.equal(entry!.start, '2026-10-05'); assert.equal(entry!.end, '2026-10-05'); assert.equal(entry!.partial, true);
  assert.equal(source.led_actual_start, null);
});
test('project baseline is not a task; undated nodes produce no fabricated events', () => {
  assert.deepEqual(calendarEntries([row({led_depth:1})], 'both'), []);
  assert.deepEqual(calendarEntries([row({led_estimate_start:null,led_estimate_end:null,led_actual_start:null,led_actual_end:null})], 'both'), []);
});
test('month grid includes leap day and Sunday-Saturday boundaries across years', () => {
  const leap = monthDays('2024-02-12');
  assert.ok(leap.includes('2024-02-29')); assert.equal(leap[0], '2024-01-28'); assert.equal(leap.at(-1), '2024-03-02');
  assert.equal(monthDays('2026-10-15').length, 35);
  assert.equal(shiftMonth('2026-12-31',1), '2027-01-01');
});
test('inclusive overlap uses separate lanes and cross-week bars are clipped', () => {
  const entries = calendarEntries([row()], 'both');
  const week = packWeek(entries, '2026-09-27');
  assert.equal(week.length, 2); assert.notEqual(week[0]!.lane, week[1]!.lane);
  assert.equal(week.find(p => p.entry.kind === 'estimate')!.span, 3);
  assert.equal(week.find(p => p.entry.kind === 'actual')!.continuesAfter, true);
  const next = packWeek(entries, '2026-10-04');
  assert.equal(next.length, 1); assert.equal(next[0]!.column, 0); assert.equal(next[0]!.span, 2); assert.equal(next[0]!.continuesBefore, true);
});
test('non-overlapping bars reuse a lane while same-day boundaries overlap', () => {
  const first = row({led_estimate_start:'2026-10-04',led_estimate_end:'2026-10-05'});
  const second = row({led_node_id:'other',led_estimate_start:'2026-10-06',led_estimate_end:'2026-10-07'});
  assert.deepEqual(packWeek(calendarEntries([first,second],'estimate'),'2026-10-04').map(p=>p.lane),[0,0]);
});
