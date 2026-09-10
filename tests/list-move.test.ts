/**
 * Where a dragged row lands.
 *
 * Every move the List offers is a parent and a position, so these tests are
 * written as the moves a person would name: promote, demote, reorder, carry it
 * to another module. The two refusals are the two that break the tree rather
 * than reshape it, and D-1's ceiling is checked here as well as on the server
 * so the answer arrives before the drop rather than after it.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  planDrop, zoneFor, subtreeHeightOf, type MovableRow,
} from '../src/app/(signed-in)/p/[slug]/list-move.ts';

const MAX_DEPTH = 5;

/*
 *  root
 *  ├── vision            (module)
 *  │   ├── camera        (task)
 *  │   │   └── lens      (subtask)
 *  │   └── plates        (task)
 *  └── backend           (module)
 *      └── api           (task)
 */
const row = (id: string, parent: string | null, depth: number): MovableRow =>
  ({ led_node_id: id, led_parent_id: parent, led_depth: depth });

const rows: MovableRow[] = [
  row('vision', 'root', 2),
  row('camera', 'vision', 3),
  row('lens', 'camera', 4),
  row('plates', 'vision', 3),
  row('backend', 'root', 2),
  row('api', 'backend', 3),
];
const at = (id: string) => rows.find((r) => r.led_node_id === id)!;

const drop = (
  dragged: string,
  target: string,
  zone: 'before' | 'after' | 'into',
  subtreeHeight = 0,
) => planDrop(at(dragged), at(target), zone, rows, {
  maxDepth: MAX_DEPTH, subtreeHeight, rootId: 'root',
});

describe('which third of the row the pointer is in', () => {
  test('the top third is before, the bottom third is after', () => {
    assert.equal(zoneFor(2, 30, true), 'before');
    assert.equal(zoneFor(28, 30, true), 'after');
  });

  test('and the middle is inside', () => {
    assert.equal(zoneFor(15, 30, true), 'into');
  });

  /* At the ceiling the middle third would offer a move D-1 refuses, and an
     offer that always fails is worse than no offer. */
  test('a row that cannot take a child splits in half instead', () => {
    assert.equal(zoneFor(15, 30, false), 'after');
    assert.equal(zoneFor(2, 30, false), 'before');
    assert.notEqual(zoneFor(15, 30, false), 'into');
  });
});

describe('making a task into a subtask', () => {
  test('dropping it inside another task', () => {
    assert.deepEqual(drop('plates', 'camera', 'into'), {
      ok: true, parentId: 'camera', afterId: null, zone: 'into',
    });
  });
});

describe('making a subtask into a task', () => {
  test('dropping it between two tasks', () => {
    assert.deepEqual(drop('lens', 'plates', 'after'), {
      ok: true, parentId: 'vision', afterId: 'plates', zone: 'after',
    });
  });

  /* The front of the run is not the same as "no answer": leaving `afterId`
     out would append it to the end, which is the opposite place. */
  test('dropping it above the first task of a module lands it first', () => {
    assert.deepEqual(drop('lens', 'camera', 'before'), {
      ok: true, parentId: 'vision', afterId: null, zone: 'before',
    });
  });
});

describe('crossing to another module', () => {
  test('as a task of that module', () => {
    assert.deepEqual(drop('camera', 'api', 'after'), {
      ok: true, parentId: 'backend', afterId: 'api', zone: 'after',
    });
  });

  test('as a subtask of one of its tasks', () => {
    assert.deepEqual(drop('camera', 'api', 'into'), {
      ok: true, parentId: 'api', afterId: null, zone: 'into',
    });
  });

  test('and the whole subtree is what the ceiling is measured against', () => {
    // `camera` carries `lens`, so landing it inside `api` puts a row at depth 5.
    assert.equal(drop('camera', 'api', 'into', 1).ok, true);
  });
});

describe('becoming a module', () => {
  /* Depths 1–3 are positions, not kinds (D-3, amended 2026-09-07): a task
     dropped beside a module is a module. */
  test('a task dropped between two modules lands under the project', () => {
    assert.deepEqual(drop('camera', 'backend', 'before'), {
      ok: true, parentId: 'root', afterId: 'vision', zone: 'before',
    });
  });
});

describe('reordering among the rows it already sits with', () => {
  test('after its neighbour', () => {
    assert.deepEqual(drop('camera', 'plates', 'after'), {
      ok: true, parentId: 'vision', afterId: 'plates', zone: 'after',
    });
  });

  /* The row being dragged is skipped when looking for its new neighbour, or
     nudging a row one place would rank it against where it already is. */
  test('before a neighbour it is already in front of', () => {
    assert.deepEqual(drop('camera', 'plates', 'before'), {
      ok: true, parentId: 'vision', afterId: null, zone: 'before',
    });
  });
});

describe('what is refused', () => {
  test('a row into itself', () => {
    assert.deepEqual(drop('camera', 'camera', 'into'),
      { ok: false, reason: 'A task cannot be moved into itself.' });
  });

  test('a row into its own child', () => {
    assert.deepEqual(drop('camera', 'lens', 'into'),
      { ok: false, reason: 'A task cannot be moved into its own subtree.' });
  });

  test('and into its own grandchild', () => {
    const deep = [...rows, row('glass', 'lens', 5)];
    assert.equal(
      planDrop(at('vision'), deep.find((r) => r.led_node_id === 'glass')!, 'into', deep,
        { maxDepth: MAX_DEPTH, subtreeHeight: 0, rootId: 'root' }).ok,
      false,
    );
  });

  test('past the depth ceiling (D-1)', () => {
    const plan = drop('plates', 'lens', 'into', 1);
    assert.equal(plan.ok, false);
    assert.match((plan as { reason: string }).reason, /5 levels/);
  });
});

describe('how deep the dragged row runs', () => {
  test('a leaf is flat', () => {
    assert.equal(subtreeHeightOf(at('plates'), rows), 0);
  });

  test('a task with a subtask is one deep', () => {
    assert.equal(subtreeHeightOf(at('camera'), rows), 1);
  });

  test('a module counts everything below it', () => {
    assert.equal(subtreeHeightOf(at('vision'), rows), 2);
  });

  /* The caller may hand rows over in any order — a single sweep would miss a
     grandchild listed before its parent. */
  test('whatever order the rows arrive in', () => {
    assert.equal(subtreeHeightOf(at('vision'), [...rows].reverse()), 2);
  });
});
