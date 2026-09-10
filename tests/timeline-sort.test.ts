/**
 * Timeline sort order.
 *
 * The comparator lives in its own module for exactly this reason: the two
 * behaviours worth defending are easy to break and invisible when they are.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { makeComparator, rankOf, orderRows, SORTS, DEFAULT_SORT, type SortableRow } from '../src/app/(signed-in)/p/[slug]/timeline/sort.ts';

const row = (over: Partial<SortableRow> & { led_name: string; led_sort_order: number }): SortableRow => ({
  led_estimate_start: null,
  led_estimate_end: null,
  led_actual_end: null,
  led_misclosure_end: null,
  ...over,
});

const order = (rows: SortableRow[], sort: Parameters<typeof makeComparator>[0], desc = false) =>
  [...rows].sort(makeComparator(sort, desc)).map((r) => r.led_name);

describe('sorting by a date', () => {
  const rows = [
    row({ led_name: 'c', led_sort_order: 3, led_estimate_end: '2026-09-30' }),
    row({ led_name: 'a', led_sort_order: 1, led_estimate_end: '2026-09-01' }),
    row({ led_name: 'b', led_sort_order: 2, led_estimate_end: '2026-09-15' }),
  ];

  test('earliest first', () => {
    assert.deepEqual(order(rows, 'estimateEnd'), ['a', 'b', 'c']);
  });

  test('and reversed', () => {
    assert.deepEqual(order(rows, 'estimateEnd', true), ['c', 'b', 'a']);
  });
});

describe('a row with nothing to sort on', () => {
  const rows = [
    row({ led_name: 'dated', led_sort_order: 2, led_estimate_end: '2026-09-15' }),
    row({ led_name: 'undated', led_sort_order: 1 }),
    row({ led_name: 'later', led_sort_order: 3, led_estimate_end: '2026-10-01' }),
  ];

  test('goes last ascending', () => {
    assert.deepEqual(order(rows, 'estimateEnd'), ['dated', 'later', 'undated']);
  });

  test('and still goes last descending — "no date" is not "earliest"', () => {
    assert.deepEqual(order(rows, 'estimateEnd', true), ['later', 'dated', 'undated']);
  });

  test('two undated rows keep the order they were filed in', () => {
    const two = [
      row({ led_name: 'second', led_sort_order: 2 }),
      row({ led_name: 'first', led_sort_order: 1 }),
    ];
    assert.deepEqual(order(two, 'estimateEnd'), ['first', 'second']);
    assert.deepEqual(order(two, 'estimateEnd', true), ['first', 'second'], 'and reversing does not shuffle them');
  });
});

describe('ties', () => {
  test('fall back to the filed order, so the list does not jitter', () => {
    const rows = [
      row({ led_name: 'z', led_sort_order: 9, led_estimate_end: '2026-09-01' }),
      row({ led_name: 'y', led_sort_order: 4, led_estimate_end: '2026-09-01' }),
      row({ led_name: 'x', led_sort_order: 1, led_estimate_end: '2026-09-01' }),
    ];
    assert.deepEqual(order(rows, 'estimateEnd'), ['x', 'y', 'z']);
  });
});

describe('sorting by lateness', () => {
  const rows = [
    row({ led_name: 'early', led_sort_order: 1, led_misclosure_end: -3 }),
    row({ led_name: 'ontime', led_sort_order: 2, led_misclosure_end: 0 }),
    row({ led_name: 'late', led_sort_order: 3, led_misclosure_end: 7 }),
    row({ led_name: 'unmeasured', led_sort_order: 4 }),
  ];

  test('descending puts the worst slippage first, with the unmeasured last', () => {
    assert.deepEqual(order(rows, 'misclosure', true), ['late', 'ontime', 'early', 'unmeasured']);
  });

  test('zero is a measurement, not a missing value', () => {
    assert.equal(rankOf(rows[1]!, 'misclosure'), 0);
    assert.equal(rankOf(rows[3]!, 'misclosure'), null);
  });
});

describe('the filed order', () => {
  test('is what `tree` means, whichever way the direction is set', () => {
    const rows = [
      row({ led_name: 'b', led_sort_order: 2, led_estimate_end: '2026-01-01' }),
      row({ led_name: 'a', led_sort_order: 1, led_estimate_end: '2026-12-31' }),
    ];
    assert.deepEqual(order(rows, 'tree'), ['a', 'b']);
    assert.deepEqual(order(rows, 'tree', true), ['a', 'b'], 'direction does not apply to the tree');
  });
});

describe('names', () => {
  test('sort case-insensitively', () => {
    const rows = [
      row({ led_name: 'beta', led_sort_order: 1 }),
      row({ led_name: 'Alpha', led_sort_order: 2 }),
    ];
    assert.deepEqual(order(rows, 'name'), ['Alpha', 'beta']);
  });
});

describe('the control', () => {
  test('every sort offered has a comparator that works', () => {
    const rows = [
      row({ led_name: 'a', led_sort_order: 1, led_estimate_start: '2026-01-01', led_estimate_end: '2026-02-01', led_actual_end: '2026-03-01', led_misclosure_end: 1 }),
      row({ led_name: 'b', led_sort_order: 2 }),
    ];
    for (const s of SORTS) {
      assert.doesNotThrow(() => order(rows, s.key), `${s.key} threw`);
      assert.equal(order(rows, s.key).length, 2);
    }
  });
});

describe('Est date — the default order', () => {
  test('is what a timeline opens in', () => {
    assert.equal(DEFAULT_SORT, 'estimate');
    assert.equal(SORTS[0]?.key, 'estimate', 'and it leads the list of choices');
  });

  test('a task with only an end sorts by that end, not last', () => {
    const rows = [
      row({ led_name: 'starts-late', led_sort_order: 1, led_estimate_start: '2026-09-20', led_estimate_end: '2026-09-30' }),
      row({ led_name: 'milestone',   led_sort_order: 2, led_estimate_end: '2026-09-10' }),
      row({ led_name: 'starts-early',led_sort_order: 3, led_estimate_start: '2026-09-01', led_estimate_end: '2026-09-05' }),
    ];
    assert.deepEqual(order(rows, 'estimate'), ['starts-early', 'milestone', 'starts-late']);
  });

  test('which is the whole difference from sorting by Starts', () => {
    const rows = [
      row({ led_name: 'milestone',    led_sort_order: 1, led_estimate_end: '2026-09-10' }),
      row({ led_name: 'starts-later', led_sort_order: 2, led_estimate_start: '2026-09-20' }),
    ];
    assert.deepEqual(order(rows, 'estimate'), ['milestone', 'starts-later']);
    assert.deepEqual(order(rows, 'estimateStart'), ['starts-later', 'milestone'],
      'by Starts, a milestone has no rank and falls to the bottom');
  });

  test('a task with neither date still goes last', () => {
    const rows = [
      row({ led_name: 'nothing', led_sort_order: 1 }),
      row({ led_name: 'dated',   led_sort_order: 2, led_estimate_end: '2026-09-10' }),
    ];
    assert.deepEqual(order(rows, 'estimate'), ['dated', 'nothing']);
    assert.deepEqual(order(rows, 'estimate', true), ['dated', 'nothing']);
  });
});

/* ============================================================== orderRows */

type Node = SortableRow & { led_node_id: string; led_parent_id: string | null; led_depth: number };

const node = (
  id: string, parent: string | null, depth: number, sortOrder: number,
  over: Partial<SortableRow> = {},
): Node => ({
  led_node_id: id,
  led_parent_id: parent,
  led_depth: depth,
  led_name: id,
  led_sort_order: sortOrder,
  led_estimate_start: null,
  led_estimate_end: null,
  led_actual_end: null,
  led_misclosure_end: null,
  ...over,
});

/**
 *  root
 *   ├── moduleA        (filed first)
 *   │    └── a-late    due December
 *   └── moduleB        (filed second)
 *        └── b-early   due January
 */
const tree: Node[] = [
  node('root', null, 1, 0),
  node('moduleA', 'root', 2, 1),
  node('a-late', 'moduleA', 3, 1, { led_estimate_start: '2026-12-01' }),
  node('moduleB', 'root', 2, 2),
  node('b-early', 'moduleB', 3, 1, { led_estimate_start: '2026-01-01' }),
];

const ids = (rows: Node[]) => rows.map((r) => r.led_node_id);
const opts = { rootId: 'root', collapsed: new Set<string>() };

describe('orderRows', () => {
  test('tree order walks the hierarchy and never draws the project row', () => {
    assert.deepEqual(
      ids(orderRows(tree, 'tree', false, opts)),
      ['moduleA', 'a-late', 'moduleB', 'b-early'],
    );
  });

  test('tree order honours a collapsed parent', () => {
    const collapsed = { rootId: 'root', collapsed: new Set(['moduleA']) };
    assert.deepEqual(ids(orderRows(tree, 'tree', false, collapsed)), ['moduleA', 'moduleB', 'b-early']);
  });

  test('any other sort flattens, so an earlier date really does come first', () => {
    // This is the bug that made flattening necessary: under the old
    // sort-within-parent behaviour, b-early sat below a-late because its
    // module was filed second, and a page "sorted by date" was not in date
    // order at all.
    const out = ids(orderRows(tree, 'estimate', false, opts));
    assert.ok(out.indexOf('b-early') < out.indexOf('a-late'),
      'January must precede December regardless of which module they sit in');
  });

  test('flattening still drops the project row', () => {
    assert.ok(!ids(orderRows(tree, 'estimate', false, opts)).includes('root'));
  });

  test('flattening ignores collapse — there is no hierarchy left to collapse', () => {
    const collapsed = { rootId: 'root', collapsed: new Set(['moduleA']) };
    assert.equal(orderRows(tree, 'estimate', false, collapsed).length, 4);
  });

  test('modules with no dates sink to the bottom of a flat run', () => {
    const out = ids(orderRows(tree, 'estimate', false, opts));
    assert.deepEqual(out.slice(-2).sort(), ['moduleA', 'moduleB']);
  });
});
