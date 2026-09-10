/**
 * Moving the List's columns.
 *
 * Three things here are decisions rather than details, and all three are the
 * ways a column-arranging feature normally goes wrong: a band that fragments,
 * a stored order that loses a column, and a new field that vanishes because
 * the saved arrangement had never heard of it.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  blocksOf, arrangeBlocks, arrangeColumns, moveBlock,
  type ArrangeableColumn,
} from '../src/app/(signed-in)/p/[slug]/list-columns.ts';

/** The grid as `list-view.tsx` files it, trimmed to what arranging reads. */
const filed: ArrangeableColumn[] = [
  { key: 'name', label: 'Name', kind: 'name' },
  { key: 'status', label: 'Status', kind: 'field' },
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
  { key: 'owner', label: 'Owner', kind: 'field' },
  { key: 'budget', label: 'Budget', kind: 'field' },
];

const keys = (columns: ArrangeableColumn[]) => columns.map((c) => c.key);
const blockKeys = (order: readonly string[] = []) =>
  arrangeBlocks(blocksOf(filed), order).map((b) => b.key);

describe('cutting the grid into blocks', () => {
  test('a band is one block, whatever its width', () => {
    assert.deepEqual(
      blocksOf(filed).map((b) => b.key),
      ['name', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner', 'budget'],
    );
  });

  /* The gutter is a seam in front of a band, not a column of its own. It
     travels with the band, or a moved band arrives without its seam and the
     one it left behind opens in front of the wrong thing. */
  test('a band carries its own leading gutter', () => {
    const estimate = blocksOf(filed).find((b) => b.key === 'estimate')!;
    assert.deepEqual(keys(estimate.columns), ['gap_est', 'est_start', 'est_end', 'est_d']);
  });

  test('the name column is pinned and alone', () => {
    const [first] = blocksOf(filed);
    assert.equal(first!.pinned, true);
    assert.deepEqual(keys(first!.columns), ['name']);
  });

  test('and nothing else is pinned', () => {
    assert.equal(blocksOf(filed).filter((b) => b.pinned).length, 1);
  });

  test('a band is labelled by its band, not by its first head', () => {
    // Three heads read "Start" and three read "Days"; a menu has no band to
    // tell them apart, so the block takes the band's name.
    const labels = blocksOf(filed).map((b) => b.label);
    assert.ok(labels.includes('Estimate'));
    assert.ok(labels.includes('Actual'));
    assert.ok(!labels.includes('Start'));
  });
});

describe('an empty order', () => {
  test('is the filed order', () => {
    assert.deepEqual(keys(arrangeColumns(filed, [])), keys(filed));
  });
});

describe('a stored order', () => {
  test('moves a whole band, gutter and all', () => {
    const order = ['actual', 'estimate', 'status', 'variance', 'progress', 'owner', 'budget'];
    assert.deepEqual(keys(arrangeColumns(filed, order)).slice(0, 9), [
      'name',
      'gap_act', 'act_start', 'act_end', 'act_d',
      'gap_est', 'est_start', 'est_end', 'est_d',
    ]);
  });

  test('never moves the name column off the left edge', () => {
    const order = ['budget', 'name', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner'];
    assert.equal(keys(arrangeColumns(filed, order))[0], 'name');
  });

  test('ignores a key for a column that is no longer there', () => {
    assert.deepEqual(
      blockKeys(['nonesuch', 'budget', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner']),
      ['name', 'budget', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner'],
    );
  });

  /* The one that matters: an arrangement saved a year ago must not swallow a
     field added since. It appears beside the neighbour it was filed next to —
     not missing, which reads as a bug in the field, and not last, where
     nobody is looking. */
  test('keeps a column it has never heard of, in its filed place', () => {
    const saved = ['status', 'estimate', 'actual', 'variance', 'progress', 'budget'];
    assert.deepEqual(blockKeys(saved), [
      'name', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner', 'budget',
    ]);
  });

  test('and loses nothing at all, whatever it says', () => {
    for (const order of [[], ['owner'], ['budget', 'owner'], ['progress', 'name', 'nope']]) {
      assert.equal(keys(arrangeColumns(filed, order)).length, filed.length, JSON.stringify(order));
      assert.deepEqual([...keys(arrangeColumns(filed, order))].sort(), [...keys(filed)].sort());
    }
  });
});

describe('moving one block', () => {
  const blocks = blocksOf(filed);
  const move = (key: string, to: number | 'left' | 'right', from: readonly string[] = []) =>
    moveBlock(blocks, from, key, to);

  test('one place left', () => {
    assert.deepEqual(move('actual', 'left'), [
      'status', 'actual', 'estimate', 'variance', 'progress', 'owner', 'budget',
    ]);
  });

  test('one place right', () => {
    assert.deepEqual(move('status', 'right'), [
      'estimate', 'status', 'actual', 'variance', 'progress', 'owner', 'budget',
    ]);
  });

  test('to a given index, which is what a drop is', () => {
    assert.deepEqual(move('budget', 0), [
      'budget', 'status', 'estimate', 'actual', 'variance', 'progress', 'owner',
    ]);
  });

  test('stops at the ends rather than wrapping', () => {
    assert.deepEqual(move('status', 'left'), move('status', 'left', ['status']));
    assert.equal(move('budget', 'right').at(-1), 'budget');
  });

  test('does nothing for a block that is not there', () => {
    assert.deepEqual(move('nonesuch', 'left').length, 7);
  });

  /* The saved value is always the complete arrangement. A partial one would
     depend on a natural order that a later release could change underneath it. */
  test('returns the whole order, not a patch of one', () => {
    assert.equal(new Set(move('owner', 'left')).size, 7);
  });

  test('and the name column is never in it', () => {
    assert.ok(!move('owner', 'left').includes('name'));
  });
});
