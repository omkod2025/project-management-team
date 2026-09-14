import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMN_BAND_KEYS, DEFAULT_COLUMNS, DEFAULT_COLUMN_ARRANGEMENT, DEFAULT_SIDE_OPTIONS,
  DEFAULT_STATUS_OPTIONS, defaultColumnOrder,
  assertColorIndex, assertFieldKind, assertFieldName, assertKeepsADoneStage,
  assertOptionLabel, assertStage, assertStatusFieldKind,
} from '../src/lib/admin-rules.ts';
import { arrangeColumns, type ArrangeableColumn } from '../src/app/(signed-in)/p/[slug]/list-columns.ts';

test('the default columns are ones a project could have created by hand', () => {
  for (const column of DEFAULT_COLUMNS) {
    assert.equal(assertFieldName(column.name), column.name);
    assert.equal(assertFieldKind(column.kind), column.kind);
  }
});

test('Status and Assign lead, and nothing is inserted between them', () => {
  assert.deepEqual(DEFAULT_COLUMNS.map((c) => c.name), ['Status', 'Assign', 'Side', 'Description']);
  assert.deepEqual(DEFAULT_COLUMNS.map((c) => c.kind), ['select', 'people', 'select', 'long_text']);
});

test('only the Status column is designated, and only it could be', () => {
  const designated = DEFAULT_COLUMNS.filter((c) => c.designateAsStatus);
  assert.equal(designated.length, 1);
  assert.equal(designated[0]!.name, 'Status');
  // D-35 allows exactly one, and only a single select can be it.
  assert.doesNotThrow(() => assertStatusFieldKind('select'));
  assert.throws(() => assertStatusFieldKind('people'));
  assert.throws(() => assertStatusFieldKind('long_text'));
});

test('only the select columns carry options, and each is one createOption would accept', () => {
  assert.deepEqual(DEFAULT_COLUMNS.filter((c) => c.options).map((c) => c.name), ['Status', 'Side']);
  for (const option of [...DEFAULT_STATUS_OPTIONS, ...DEFAULT_SIDE_OPTIONS]) {
    assert.equal(assertOptionLabel(option.label), option.label);
    assert.equal(assertStage(option.stage), option.stage);
    assert.equal(assertColorIndex(option.colorIndex), option.colorIndex);
  }
});

test('the default Status column satisfies the one rule designation demands', () => {
  // D-35 via assertKeepsADoneStage: without a done option, finished work is
  // never recorded, and createProject would be designating a broken column.
  assert.doesNotThrow(() => assertKeepsADoneStage(true, DEFAULT_STATUS_OPTIONS.map((o) => o.stage)));
});

test('only ONPROCESS and COMPLETED carry a stage, which is the whole of D-13', () => {
  assert.deepEqual(Object.fromEntries(DEFAULT_STATUS_OPTIONS.map((o) => [o.label, o.stage])), {
    BACKLOG: 'notStarted',
    ONPROCESS: 'inProgress',
    COMPLETED: 'done',
    // D-34b: stopped without finishing, so no automatic end date is captured.
    CANCEL: null,
    HOLD: null,
  });
});

test('Side says which side of the work a task is, and never drives a date', () => {
  assert.deepEqual(DEFAULT_SIDE_OPTIONS.map((o) => o.label), ['BACKEND', 'FRONTEND', 'TEST', 'SA']);
  // D-35: stages outside the designated status field are ignored, so carrying
  // one here would only read as though it meant something.
  assert.deepEqual(DEFAULT_SIDE_OPTIONS.map((o) => o.stage), DEFAULT_SIDE_OPTIONS.map(() => null));
  assert.throws(() => assertKeepsADoneStage(true, DEFAULT_SIDE_OPTIONS.map((o) => o.stage)));
});

test('within a column the labels are distinct and so are their colours', () => {
  for (const options of [DEFAULT_STATUS_OPTIONS, DEFAULT_SIDE_OPTIONS]) {
    assert.equal(new Set(options.map((o) => o.label)).size, options.length);
    assert.equal(new Set(options.map((o) => o.colorIndex)).size, options.length);
  }
});

test('no two default columns share a name', () => {
  assert.equal(new Set(DEFAULT_COLUMNS.map((c) => c.name)).size, DEFAULT_COLUMNS.length);
});

/* ------------------------------------------------- the List's arrangement */

test('Assign and Side open next to Status, ahead of every date band', () => {
  assert.deepEqual(DEFAULT_COLUMN_ARRANGEMENT, [
    'Status', 'Assign', 'Side',
    'estimate', 'actual', 'variance', 'progress',
    'Description',
  ]);
});

test('the arrangement names every default column and every band, once each', () => {
  const expected = [...DEFAULT_COLUMNS.map((c) => c.name), ...COLUMN_BAND_KEYS];
  assert.deepEqual([...DEFAULT_COLUMN_ARRANGEMENT].sort(), [...expected].sort());
  assert.equal(new Set(DEFAULT_COLUMN_ARRANGEMENT).size, DEFAULT_COLUMN_ARRANGEMENT.length);
});

test('resolving the arrangement swaps names for ids and leaves bands alone', () => {
  const ids = { Status: 'id-status', Assign: 'id-assign', Side: 'id-side', Description: 'id-desc' };
  assert.deepEqual(defaultColumnOrder(ids), [
    'id-status', 'id-assign', 'id-side',
    'estimate', 'actual', 'variance', 'progress',
    'id-desc',
  ]);
});

test('an unresolved name is dropped rather than stored as a key matching nothing', () => {
  assert.deepEqual(defaultColumnOrder({ Status: 'id-status' }), [
    'id-status', 'estimate', 'actual', 'variance', 'progress',
  ]);
  assert.deepEqual(defaultColumnOrder({}), [...COLUMN_BAND_KEYS]);
});

test('the arrangement really does move them, through the grid\'s own arranger', () => {
  // The keys above are only correct if they are the keys `blocksOf` derives.
  // Nothing else in this file would catch a band renamed or a block keyed
  // differently, so this drives the real arranger over the real filed order.
  const ids = { Status: 'id-status', Assign: 'id-assign', Side: 'id-side', Description: 'id-desc' };
  const filed: ArrangeableColumn[] = [
    { key: 'name', label: 'Name', kind: 'name' },
    { key: ids.Status, label: 'Status', kind: 'field' },
    { key: 'gap_est', label: '', kind: 'gutter' },
    { key: 'est_start', label: 'Start', kind: 'date', group: 'estimate' },
    { key: 'est_end', label: 'End', kind: 'date', group: 'estimate' },
    { key: 'est_d', label: 'Days', kind: 'computed', group: 'estimate' },
    { key: 'gap_act', label: '', kind: 'gutter' },
    { key: 'act_start', label: 'Start', kind: 'date', group: 'actual' },
    { key: 'act_end', label: 'End', kind: 'date', group: 'actual' },
    { key: 'act_d', label: 'Days', kind: 'computed', group: 'actual' },
    { key: 'gap_var', label: '', kind: 'gutter' },
    { key: 'mis', label: 'Slip', kind: 'misclosure', group: 'variance' },
    { key: 'gap_prog', label: '', kind: 'gutter' },
    { key: 'closed', label: 'Closed', kind: 'closed', group: 'progress' },
    { key: ids.Assign, label: 'Assign', kind: 'field' },
    { key: ids.Side, label: 'Side', kind: 'field' },
    { key: ids.Description, label: 'Description', kind: 'field' },
  ];

  const drawn = arrangeColumns(filed, defaultColumnOrder(ids))
    .filter((c) => c.kind !== 'gutter')
    .map((c) => c.key);

  assert.deepEqual(drawn.slice(0, 4), ['name', ids.Status, ids.Assign, ids.Side]);
  assert.equal(drawn[drawn.length - 1], ids.Description);
  // Nothing was lost or duplicated on the way through.
  assert.equal(drawn.length, filed.filter((c) => c.kind !== 'gutter').length);
});

test('the Name column is never in the arrangement, because it cannot move', () => {
  // It is pinned to the left edge; a column that scrolled past it could not
  // pin to the same edge, so it is not a movable block at all.
  assert.equal(DEFAULT_COLUMN_ARRANGEMENT.includes('name'), false);
});
