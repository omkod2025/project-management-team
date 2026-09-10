/**
 * List sort order, over one column and over several.
 *
 * The comparator lives in its own module for exactly this reason: what it does
 * with an empty cell, with a second column, and with a row that is out of
 * closure are decisions, and all three are invisible when they break.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeComparator, rankOf, isSortable, compareModuleNames,
  type SortableColumn, type SortableRow,
} from '../src/app/(signed-in)/p/[slug]/list-sort.ts';

const col = (over: Partial<SortableColumn> & { key: string; kind: SortableColumn['kind'] }): SortableColumn => ({
  label: over.key,
  ...over,
});

const NAME = col({ key: 'name', kind: 'name' });
const EST_END = col({ key: 'est_end', kind: 'date', dateKey: 'estimateEnd' });
const EST_START = col({ key: 'est_start', kind: 'date', dateKey: 'estimateStart' });
const SLIP = col({ key: 'mis', kind: 'misclosure' });
const CLOSED = col({ key: 'closed', kind: 'closed' });
const EST_DAYS = col({ key: 'est_d', kind: 'computed' });

const STATUS: SortableColumn = col({
  key: 'f-status',
  kind: 'field',
  field: {
    id: 'f-status',
    kind: 'select',
    options: [{ id: 'o1', label: 'ยังไม่เริ่ม' }, { id: 'o2', label: 'กำลังทำ' }, { id: 'o3', label: 'เสร็จ' }],
  },
});

const row = (over: Partial<SortableRow> & { led_name: string; led_sort_order: number }): SortableRow => ({
  led_estimate_start: null,
  led_estimate_end: null,
  led_actual_start: null,
  led_actual_end: null,
  led_estimate_workdays: null,
  led_actual_workdays: null,
  led_misclosure_end: null,
  led_out_of_closure: false,
  led_closed_count: 0,
  led_descendant_count: 0,
  led_custom_values: null,
  ...over,
});

const columns = [NAME, EST_START, EST_END, SLIP, CLOSED, EST_DAYS, STATUS];
const order = (rows: SortableRow[], terms: { key: string; descending: boolean }[]) =>
  [...rows].sort(makeComparator(terms, columns)).map((r) => r.led_name);

const asc = (key: string) => [{ key, descending: false }];
const desc = (key: string) => [{ key, descending: true }];

describe('no sort at all', () => {
  const rows = [
    row({ led_name: 'c', led_sort_order: 3 }),
    row({ led_name: 'a', led_sort_order: 1 }),
    row({ led_name: 'b', led_sort_order: 2 }),
  ];

  test('is the filed order', () => {
    assert.deepEqual(order(rows, []), ['a', 'b', 'c']);
  });

  test('and so is a sort on a column that is not there', () => {
    assert.deepEqual(order(rows, asc('nonesuch')), ['a', 'b', 'c']);
  });
});

describe('one column', () => {
  const rows = [
    row({ led_name: 'c', led_sort_order: 1, led_estimate_end: '2026-09-30' }),
    row({ led_name: 'a', led_sort_order: 2, led_estimate_end: '2026-09-01' }),
    row({ led_name: 'b', led_sort_order: 3, led_estimate_end: '2026-09-15' }),
  ];

  test('earliest first', () => {
    assert.deepEqual(order(rows, asc('est_end')), ['a', 'b', 'c']);
  });

  test('and reversed', () => {
    assert.deepEqual(order(rows, desc('est_end')), ['c', 'b', 'a']);
  });
});

describe('a row with nothing in the column', () => {
  const rows = [
    row({ led_name: 'dated', led_sort_order: 2, led_estimate_end: '2026-09-15' }),
    row({ led_name: 'undated', led_sort_order: 1 }),
  ];

  test('goes last ascending', () => {
    assert.deepEqual(order(rows, asc('est_end')), ['dated', 'undated']);
  });

  /* The decision worth defending: "no date" is not "earliest", so reversing
     the order must not float every empty row to the top. */
  test('and last descending too', () => {
    assert.deepEqual(order(rows, desc('est_end')), ['dated', 'undated']);
  });
});

describe('more than one column', () => {
  const rows = [
    row({ led_name: 'b', led_sort_order: 1, led_estimate_start: '2026-09-01', led_estimate_end: '2026-09-20' }),
    row({ led_name: 'a', led_sort_order: 2, led_estimate_start: '2026-09-01', led_estimate_end: '2026-09-10' }),
    row({ led_name: 'c', led_sort_order: 3, led_estimate_start: '2026-08-01', led_estimate_end: '2026-09-30' }),
  ];

  test('the first column decides where it can', () => {
    assert.deepEqual(order(rows, [...asc('est_start'), ...asc('est_end')]), ['c', 'a', 'b']);
  });

  test('the second breaks the tie the first leaves', () => {
    assert.deepEqual(
      order(rows, [{ key: 'est_start', descending: false }, { key: 'est_end', descending: true }]),
      ['c', 'b', 'a'],
    );
  });

  test('each column keeps its own direction', () => {
    assert.deepEqual(
      order(rows, [{ key: 'est_start', descending: true }, { key: 'est_end', descending: false }]),
      ['a', 'b', 'c'],
    );
  });

  test('and the filed order settles what every column ties', () => {
    const tied = [
      row({ led_name: 'second', led_sort_order: 2, led_estimate_end: '2026-09-01' }),
      row({ led_name: 'first', led_sort_order: 1, led_estimate_end: '2026-09-01' }),
    ];
    assert.deepEqual(order(tied, [...asc('est_end'), ...asc('est_start')]), ['first', 'second']);
  });
});

describe('by name', () => {
  test('is alphabetical, case-blind', () => {
    const rows = [
      row({ led_name: 'beta', led_sort_order: 1 }),
      row({ led_name: 'Alpha', led_sort_order: 2 }),
    ];
    assert.deepEqual(order(rows, asc('name')), ['Alpha', 'beta']);
  });
});

describe('by a select field', () => {
  const at = (id: string | null, n: number) =>
    row({ led_name: id ?? 'none', led_sort_order: n, led_custom_values: id ? { 'f-status': id } : {} });

  /* By the option's filed position, not its label: alphabetising a status
     column would scramble the one custom field that has a real sequence. */
  test('runs in the option order, not alphabetically', () => {
    const rows = [at('o3', 1), at('o1', 2), at('o2', 3)];
    assert.deepEqual(order(rows, asc('f-status')), ['o1', 'o2', 'o3']);
  });

  test('an unset cell still goes last', () => {
    const rows = [at(null, 1), at('o2', 2)];
    assert.deepEqual(order(rows, desc('f-status')), ['o2', 'none']);
  });
});

describe('by slip', () => {
  test('out of closure sorts past every figure (D-16)', () => {
    const rows = [
      row({ led_name: 'broken', led_sort_order: 1, led_out_of_closure: true }),
      row({ led_name: 'late', led_sort_order: 2, led_misclosure_end: 12 }),
      row({ led_name: 'ontime', led_sort_order: 3, led_misclosure_end: 0 }),
    ];
    assert.deepEqual(order(rows, asc('mis')), ['ontime', 'late', 'broken']);
  });
});

describe('by closed', () => {
  /* A proportion, not a count: 3/4 is further along than 10/40. */
  test('ranks by proportion', () => {
    const rows = [
      row({ led_name: 'ten of forty', led_sort_order: 1, led_closed_count: 10, led_descendant_count: 40 }),
      row({ led_name: 'three of four', led_sort_order: 2, led_closed_count: 3, led_descendant_count: 4 }),
    ];
    assert.deepEqual(order(rows, asc('closed')), ['ten of forty', 'three of four']);
  });

  test('a leaf has nothing to rank', () => {
    assert.equal(rankOf(row({ led_name: 'leaf', led_sort_order: 1 }), CLOSED), null);
  });
});

describe('the module order', () => {
  const named = (name: string, order: number) => row({ led_name: name, led_sort_order: order });
  const modules = (rows: SortableRow[]) =>
    [...rows].sort(compareModuleNames).map((r) => r.led_name);

  /* The one place in the run where the filed order is not the baseline: a
     module is a permanent division, named once and read constantly, and its
     filed position is only the accident of which was created first. */
  test('is alphabetical, not filed', () => {
    assert.deepEqual(
      modules([named('Vision', 1), named('Backend', 2), named('Hardware', 3)]),
      ['Backend', 'Hardware', 'Vision'],
    );
  });

  test('puts Module 2 before Module 10, as anybody numbering them expects', () => {
    assert.deepEqual(
      modules([named('Module 10', 1), named('Module 2', 2), named('Module 1', 3)]),
      ['Module 1', 'Module 2', 'Module 10'],
    );
  });

  test('does not care about case', () => {
    assert.deepEqual(modules([named('beta', 1), named('Alpha', 2)]), ['Alpha', 'beta']);
  });

  /* Content is Thai. A byte comparison would order these by code point, which
     is not the order a Thai reader looks them up in. */
  test('orders Thai names by the Thai collation', () => {
    assert.deepEqual(
      modules([named('ระบบแจ้งเตือน', 1), named('กล้อง', 2), named('ทะเบียนรถ', 3)]),
      ['กล้อง', 'ทะเบียนรถ', 'ระบบแจ้งเตือน'],
    );
  });

  test('and two identical names fall back to the filed order', () => {
    const rows = [named('Same', 2), named('Same', 1)];
    assert.deepEqual(rows.sort(compareModuleNames).map((r) => r.led_sort_order), [1, 2]);
  });
});

describe('what may be sorted', () => {
  test('a gutter may not', () => {
    assert.equal(isSortable(col({ key: 'gap_est', kind: 'gutter' })), false);
  });

  test('nor an image', () => {
    assert.equal(
      isSortable(col({ key: 'f-img', kind: 'field', field: { id: 'f-img', kind: 'image', options: [] } })),
      false,
    );
  });

  test('but an ordinary column may', () => {
    assert.equal(isSortable(EST_END), true);
  });
});
