/**
 * Tree operations through the HTTP API: create, move, archive, restore.
 *
 *   npm run dev            # in one terminal
 *   npm run test:e2e       # in another
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  setup, signIn, createNode, moveNode, archiveNode, restoreNode, patchNode,
  type Fixture, type Jar,
} from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);
});

after(async () => { await fx?.cleanup(); });

async function node(id: string) {
  const { rows } = await fx.client.query(
    `SELECT node_parent_id, node_depth, node_archived_at, node_sort_order
       FROM pmt_nodes WHERE node_id = $1`,
    [id],
  );
  return rows[0];
}

async function liveCount() {
  const { rows } = await fx.client.query(
    `SELECT count(*)::int AS n FROM pmt_nodes
      WHERE node_project_id = $1 AND node_archived_at IS NULL`,
    [fx.projectId],
  );
  return rows[0].n as number;
}

/* =================================================================== create */

describe('create', () => {
  test('a member-level capability, refused to a viewer', async () => {
    const res = await createNode(viewer, fx.nodes.module);
    assert.equal(res.status, 403);
  });

  test('a child takes the depth below its parent', async () => {
    const res = await createNode(admin, fx.nodes.task, 'Fresh subtask');
    assert.equal(res.status, 200);
    assert.equal(res.body?.led_depth, 4);
    assert.equal(res.body?.led_parent_id, fx.nodes.task);
  });

  test('D-2 — a child of a depth-6 node is refused', async () => {
    // build down to the ceiling: sub(4) -> 5 -> 6
    const five = await createNode(admin, fx.nodes.sub, 'five');
    assert.equal(five.body?.led_depth, 5);
    const six = await createNode(admin, String(five.body?.led_node_id), 'six');
    assert.equal(six.body?.led_depth, 6);

    const seven = await createNode(admin, String(six.body?.led_node_id), 'seven');
    assert.equal(seven.status, 422);
    assert.equal(seven.body?.code, 'E_MAX_DEPTH');
  });
});

/* ===================================================================== move */

describe('move (D-3)', () => {
  test('a viewer cannot move anything', async () => {
    const res = await moveNode(viewer, fx.nodes.task, fx.nodes.module2);
    assert.equal(res.status, 403);
  });

  test('a task moves between modules and keeps its depth', async () => {
    const res = await moveNode(admin, fx.nodes.task, fx.nodes.module2);
    assert.equal(res.status, 200);

    const moved = await node(fx.nodes.task);
    assert.equal(moved.node_parent_id, fx.nodes.module2);
    assert.equal(moved.node_depth, 3);
  });

  test('its subtree travels with it', async () => {
    const sub = await node(fx.nodes.sub);
    assert.equal(sub.node_parent_id, fx.nodes.task);
    assert.equal(sub.node_depth, 4, 'the child keeps its relative depth');
  });

  test('the old parent loses the roll-up, the new one gains it', async () => {
    const oldParent = await patchNode(admin, fx.nodes.module, {});
    const newParent = await patchNode(admin, fx.nodes.module2, {});
    assert.equal(oldParent.body?.led_rollup_est_end, null, 'nothing left beneath it');
    assert.ok(newParent.body?.led_rollup_est_end, 'the moved subtree now rolls up here');
  });

  test('outdent — a subtask promoted to its parent level, subtree following', async () => {
    // sub (depth 4) moves up under module2 (depth 2), so it lands at depth 3
    const res = await moveNode(admin, fx.nodes.sub, fx.nodes.module2);
    assert.equal(res.status, 200);

    const moved = await node(fx.nodes.sub);
    assert.equal(moved.node_depth, 3, 'promoted one level');
    assert.equal(moved.node_parent_id, fx.nodes.module2);
  });

  test('indent — and back down again under its former parent', async () => {
    const res = await moveNode(admin, fx.nodes.sub, fx.nodes.task);
    assert.equal(res.status, 200);
    assert.equal((await node(fx.nodes.sub)).node_depth, 4, 'demoted back');
  });

  test('a node cannot be moved into its own subtree — that would make a cycle', async () => {
    const res = await moveNode(admin, fx.nodes.module2, fx.nodes.task);
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_LEVEL_MISMATCH');
    assert.match(String(res.body?.message), /own subtree/i);
  });

  test('nor under itself', async () => {
    const res = await moveNode(admin, fx.nodes.task, fx.nodes.task);
    assert.equal(res.status, 422);
  });

  test('a move that would exceed the depth ceiling is refused', async () => {
    // build a chain beneath the subtask down to depth 6, then try to indent
    // the whole thing one level deeper
    const five = await createNode(admin, fx.nodes.sub, 'five');
    const six = await createNode(admin, String(five.body?.led_node_id), 'six');
    assert.equal(six.body?.led_depth, 6);

    // task (depth 3) now has three levels beneath it; indenting it under a
    // depth-3 sibling would put the deepest at 7
    const sibling = await createNode(admin, fx.nodes.module2, 'sibling');
    const res = await moveNode(admin, fx.nodes.task, String(sibling.body?.led_node_id));
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_MAX_DEPTH');
  });

  test('the tree is still intact after every refusal', async () => {
    const t = await node(fx.nodes.task);
    assert.equal(t.node_parent_id, fx.nodes.module2);
    assert.equal(t.node_depth, 3);
  });
});

/* ================================================================== placing */

/**
 * Where a moved row lands among its new siblings (D-3).
 *
 * A move that only re-parents leaves the row wherever its old sort order
 * happens to fall, which on a page is "somewhere in the middle for no reason".
 * These are the tests for the second half of a move: the position.
 */
describe('placing a moved row', () => {
  let first = '', second = '', third = '';

  test('three rows under one parent, in order', async () => {
    for (const name of ['first', 'second', 'third']) {
      const created = await createNode(admin, fx.nodes.module, name);
      assert.equal(created.status, 200);
      const id = String(created.body?.led_node_id);
      if (name === 'first') first = id;
      else if (name === 'second') second = id;
      else third = id;
    }
    assert.ok((await node(first)).node_sort_order < (await node(second)).node_sort_order);
    assert.ok((await node(second)).node_sort_order < (await node(third)).node_sort_order);
  });

  test('a row reorders under the parent it already has', async () => {
    const res = await patchNode(admin, first, { afterId: second });
    assert.equal(res.status, 200);
    const [a, b, c] = [await node(first), await node(second), await node(third)];
    assert.ok(b.node_sort_order < a.node_sort_order, 'now behind the second');
    assert.ok(a.node_sort_order < c.node_sort_order, 'and still in front of the third');
    assert.equal(a.node_parent_id, fx.nodes.module, 'and has not been re-parented');
  });

  test('afterId null puts it at the front', async () => {
    const res = await patchNode(admin, third, { afterId: null });
    assert.equal(res.status, 200);
    const [a, b, c] = [await node(first), await node(second), await node(third)];
    assert.ok(c.node_sort_order < a.node_sort_order);
    assert.ok(c.node_sort_order < b.node_sort_order);
  });

  test('a viewer cannot reorder either', async () => {
    const res = await patchNode(viewer, first, { afterId: null });
    assert.equal(res.status, 403);
  });

  test('parent and position in one move — the drag that crosses a module', async () => {
    const res = await patchNode(admin, first, { parentId: fx.nodes.module2, afterId: null });
    assert.equal(res.status, 200);
    const moved = await node(first);
    assert.equal(moved.node_parent_id, fx.nodes.module2);

    const { rows } = await fx.client.query(
      `SELECT node_id FROM pmt_nodes
        WHERE node_parent_id = $1 AND node_archived_at IS NULL
        ORDER BY node_sort_order`,
      [fx.nodes.module2],
    );
    assert.equal(rows[0].node_id, first, 'and it landed at the front, as asked');
  });

  test('a reorder is refused when the node does not exist', async () => {
    const res = await patchNode(admin, '00000000-0000-0000-0000-000000000000', { afterId: null });
    assert.equal(res.status, 404);
  });
});

/* ================================================================== archive */

describe('archive and restore (D-4)', () => {
  test('archiving is admin-only', async () => {
    const res = await archiveNode(viewer, fx.nodes.task);
    assert.equal(res.status, 403);
  });

  test('archiving is refused without a session', async () => {
    const res = await archiveNode(null, fx.nodes.task);
    assert.equal(res.status, 401);
  });

  test('the project root cannot be archived', async () => {
    const res = await archiveNode(admin, fx.nodes.root);
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_LEVEL_MISMATCH');
  });

  test('archiving takes the whole subtree, and says how many', async () => {
    const before = await liveCount();
    const res = await archiveNode(admin, fx.nodes.task);
    assert.equal(res.status, 200);

    const taken = Number(res.body?.archived);
    assert.ok(taken >= 2, `expected the task plus its descendants, got ${taken}`);
    assert.equal(await liveCount(), before - taken);
    assert.ok((await node(fx.nodes.sub)).node_archived_at, 'the child went too');
  });

  test('archived nodes leave the ledger and the roll-up', async () => {
    const parent = await patchNode(admin, fx.nodes.module2, {});
    assert.equal(parent.body?.led_rollup_est_end, null);
  });

  test('archiving twice is harmless', async () => {
    const res = await archiveNode(admin, fx.nodes.task);
    assert.equal(res.status, 200);
    assert.equal(res.body?.archived, 0);
  });

  test('restore is a clean round trip', async () => {
    const res = await restoreNode(admin, fx.nodes.task);
    assert.equal(res.status, 200);
    assert.equal((await node(fx.nodes.task)).node_archived_at, null);
    assert.equal((await node(fx.nodes.sub)).node_archived_at, null);
  });
});
