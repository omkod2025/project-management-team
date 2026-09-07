/**
 * End-to-end tests through the HTTP API.
 *
 *   npm run dev                    # in one terminal
 *   npm run test:e2e               # in another
 *
 * These cover the layer the unit tests cannot: authentication, the permission
 * choke point, the JSON boundary, and the SQL that only runs against a real
 * database — working-day snapping above all.
 *
 * They sign in through the real Auth.js endpoints with an account the run
 * creates and deletes. If sign-in breaks for users, these fail too.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

import { setup, signIn, patchNode, todayBangkok, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);
});

after(async () => {
  await fx?.cleanup();
});

/** Read a node straight from the database, bypassing the API's own view of it. */
async function row(nodeId: string) {
  const { rows } = await fx.client.query(
    `SELECT node_estimate_start, node_estimate_end,
            node_actual_start, node_actual_end,
            node_actual_start_raw, node_actual_end_raw,
            node_actual_source_start, node_actual_source_end,
            node_custom_values
       FROM pmt_nodes WHERE node_id = $1`,
    [nodeId],
  );
  return rows[0];
}

/* ============================================================ auth and roles */

describe('authentication and permissions', () => {
  test('an unauthenticated write is refused', async () => {
    const res = await patchNode(null, fx.nodes.task, { estimateEnd: '2026-09-30' });
    assert.equal(res.status, 401);
  });

  test('a viewer cannot write', async () => {
    const res = await patchNode(viewer, fx.nodes.task, { estimateEnd: '2026-09-30' });
    assert.equal(res.status, 403);
    assert.equal(res.body?.code, 'E_FORBIDDEN');
  });

  test("a viewer's refusal changes nothing", async () => {
    const after = await row(fx.nodes.task);
    assert.equal(after.node_estimate_end, '2026-09-10');
  });

  test('an admin can write', async () => {
    const res = await patchNode(admin, fx.nodes.task, { estimateEnd: '2026-09-11' });
    assert.equal(res.status, 200);
    assert.equal(res.body?.led_estimate_end, '2026-09-11');
  });
});

/* ================================================================= the ledger */

describe('the response carries every recomputed figure', () => {
  test('durations and roll-up come back with the write, so the client never refetches', async () => {
    const res = await patchNode(admin, fx.nodes.task, { estimateEnd: '2026-09-10' });
    assert.equal(res.status, 200);
    // 1-10 Sep 2026: 5, 6 are the weekend, so 8 working days.
    assert.equal(res.body?.led_estimate_workdays, 8);
    assert.equal(res.body?.led_out_of_closure, false);
  });
});

/* ====================================================================== D-13 */

describe('D-13 — automatic actual capture, through the API', () => {
  test('moving to an inProgress option sets only the actual start', async () => {
    const res = await patchNode(admin, fx.nodes.sub, {
      values: { [fx.statusFieldId]: fx.options.running },
    });
    assert.equal(res.status, 200);

    const r = await row(fx.nodes.sub);
    assert.equal(r.node_actual_start, todayBangkok());
    assert.equal(r.node_actual_source_start, 'auto');
    assert.equal(r.node_actual_end, null, 'the end is not touched');
  });

  test('moving to a done option sets the end and leaves the recorded start alone', async () => {
    const before = await row(fx.nodes.sub);
    const res = await patchNode(admin, fx.nodes.sub, {
      values: { [fx.statusFieldId]: fx.options.done },
    });
    assert.equal(res.status, 200);

    const r = await row(fx.nodes.sub);
    assert.equal(r.node_actual_start, before.node_actual_start, 'the start survives');
    assert.equal(r.node_actual_end, todayBangkok());
    assert.equal(r.node_actual_source_end, 'auto');
  });

  test('going back to inProgress does not clear the end', async () => {
    await patchNode(admin, fx.nodes.sub, { values: { [fx.statusFieldId]: fx.options.running } });
    const r = await row(fx.nodes.sub);
    assert.equal(r.node_actual_end, todayBangkok(), 'the work did finish once');
  });

  test('D-34b — a stageless option captures nothing', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      values: { [fx.statusFieldId]: fx.options.cancelled },
    });
    assert.equal(res.status, 200);
    const r = await row(fx.nodes.task);
    assert.equal(r.node_actual_start, null, 'a cancelled task never started');
    assert.equal(r.node_actual_end, null, 'and never finished');
  });
});

/* ================================================================ D-15, D-16 */

describe('D-15 — the database snaps actual dates forward', () => {
  test('a Saturday becomes the following Monday, and the raw value is kept', async () => {
    // 2026-09-05 is a Saturday; 2026-09-07 is the Monday.
    const res = await patchNode(admin, fx.nodes.module, { actualStart: '2026-09-05' });
    assert.equal(res.status, 200);

    const r = await row(fx.nodes.module);
    assert.equal(r.node_actual_start, '2026-09-07', 'snapped forward');
    assert.equal(r.node_actual_start_raw, '2026-09-05', 'and the truth is preserved');
    assert.equal(r.node_actual_source_start, 'manual');
  });

  test('a holiday run is skipped entirely', async () => {
    // 11-12 Apr 2026 is a weekend, 13-15 is Songkran, so the answer is the 16th.
    const res = await patchNode(admin, fx.nodes.module, { actualStart: '2026-04-11' });
    assert.equal(res.status, 200);
    const r = await row(fx.nodes.module);
    assert.equal(r.node_actual_start, '2026-04-16');
    assert.equal(r.node_actual_start_raw, '2026-04-11');
  });

  test('D-16 — snapping that would invert a range collapses it instead of failing', async () => {
    // Both endpoints inside one weekend: 5 and 6 Sep both snap to Monday 7th.
    const res = await patchNode(admin, fx.nodes.module, {
      actualStart: '2026-09-05',
      actualEnd: '2026-09-06',
    });
    assert.equal(res.status, 200);

    const r = await row(fx.nodes.module);
    assert.equal(r.node_actual_start, '2026-09-07');
    assert.equal(r.node_actual_end, '2026-09-07', 'one working day, not an inverted range');
    assert.equal(r.node_actual_end_raw, '2026-09-06', 'the weekend work is still on record');
  });

  test('D-17 — an estimate on a weekend is stored exactly as given', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      estimateStart: '2026-09-05',
      estimateEnd: '2026-09-06',
    });
    assert.equal(res.status, 200);
    const r = await row(fx.nodes.task);
    assert.equal(r.node_estimate_start, '2026-09-05', 'estimates are never snapped');
    assert.equal(r.node_estimate_end, '2026-09-06');
  });
});

/* ====================================================================== D-10 */

describe('D-10 — the rule the product exists for', () => {
  test('writing an actual leaves the estimate untouched', async () => {
    await patchNode(admin, fx.nodes.task, { estimateStart: '2026-09-01', estimateEnd: '2026-09-10' });
    const before = await row(fx.nodes.task);

    await patchNode(admin, fx.nodes.task, { actualEnd: '2026-09-14' });
    const after = await row(fx.nodes.task);

    assert.equal(after.node_estimate_start, before.node_estimate_start);
    assert.equal(after.node_estimate_end, before.node_estimate_end);
  });

  test('writing an estimate leaves the actual untouched', async () => {
    const before = await row(fx.nodes.task);
    await patchNode(admin, fx.nodes.task, { estimateEnd: '2026-09-25' });
    const after = await row(fx.nodes.task);

    assert.equal(after.node_actual_end, before.node_actual_end);
    assert.equal(after.node_actual_source_end, before.node_actual_source_end);
  });

  test("D-21 — a child's dates never rewrite its parent's baseline", async () => {
    const before = await row(fx.nodes.module);
    await patchNode(admin, fx.nodes.task, { estimateEnd: '2026-10-30' });
    const after = await row(fx.nodes.module);

    assert.equal(after.node_estimate_start, before.node_estimate_start);
    assert.equal(after.node_estimate_end, before.node_estimate_end);
  });

  test('D-22 — but the parent is reported out of closure', async () => {
    const res = await patchNode(admin, fx.nodes.module, {});
    assert.equal(res.status, 200);
    assert.equal(res.body?.led_out_of_closure, true, 'the child runs past the baseline');
  });
});

/* ====================================================================== D-14 */

describe('D-14 — manual wins, permanently', () => {
  test('a hand-set actual is recorded as manual', async () => {
    await patchNode(admin, fx.nodes.sub, { actualEnd: '2026-09-14' });
    const r = await row(fx.nodes.sub);
    assert.equal(r.node_actual_source_end, 'manual');
  });

  test('a later done transition does not overwrite it', async () => {
    await patchNode(admin, fx.nodes.sub, { values: { [fx.statusFieldId]: fx.options.backlog } });
    await patchNode(admin, fx.nodes.sub, { values: { [fx.statusFieldId]: fx.options.done } });
    const r = await row(fx.nodes.sub);
    assert.equal(r.node_actual_end, '2026-09-14', 'the human value stands');
    assert.equal(r.node_actual_source_end, 'manual');
  });
});

/* ============================================================ value validation */

describe('the JSON boundary refuses what the rules refuse', () => {
  test('an inverted estimate range is refused', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      estimateStart: '2026-10-01',
      estimateEnd: '2026-09-01',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_RANGE_INVERTED');
  });

  test('an archived option cannot be chosen', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      values: { [fx.statusFieldId]: fx.options.archived },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body?.code, 'E_OPTION_ARCHIVED');
  });

  test('an unknown column is refused', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      values: { '00000000-0000-0000-0000-000000000000': 'x' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_UNKNOWN_FIELD');
  });

  test('a client cannot write the importer key', async () => {
    const res = await patchNode(admin, fx.nodes.task, { values: { _clickup_id: 'forged' } });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_RESERVED_KEY');
  });

  test('money keeps the currency configured on the field, not one the client sends', async () => {
    const res = await patchNode(admin, fx.nodes.task, {
      values: { [fx.budgetFieldId]: { amount: 500, currency: 'THB' } },
    });
    assert.equal(res.status, 200);
    const r = await row(fx.nodes.task);
    assert.deepEqual(r.node_custom_values[fx.budgetFieldId], { amount: 500, currency: 'USD' });
  });

  test('a node that does not exist is a 404', async () => {
    const res = await patchNode(admin, '00000000-0000-0000-0000-000000000000', { estimateEnd: null });
    assert.equal(res.status, 404);
  });
});

/* ==================================================== Q3 — counted progress */

describe('Q3 — progress is counted from the status column, never entered', () => {
  test('a parent reports how many descendants are closed', async () => {
    // put the subtask at a done stage and the task at a running one
    await patchNode(admin, fx.nodes.sub, { values: { [fx.statusFieldId]: fx.options.done } });
    await patchNode(admin, fx.nodes.task, { values: { [fx.statusFieldId]: fx.options.running } });

    const res = await patchNode(admin, fx.nodes.module, {});
    assert.equal(res.status, 200);
    assert.equal(res.body?.led_descendant_count, 2, 'the task and its subtask');
    assert.equal(res.body?.led_closed_count, 1, 'one of them is finished');
  });

  test('the count follows a status change immediately, in the same response', async () => {
    await patchNode(admin, fx.nodes.task, { values: { [fx.statusFieldId]: fx.options.done } });
    const res = await patchNode(admin, fx.nodes.module, {});
    assert.equal(res.body?.led_closed_count, 2, 'both now closed');
  });

  test('a stageless option does not count as finished', async () => {
    await patchNode(admin, fx.nodes.task, { values: { [fx.statusFieldId]: fx.options.cancelled } });
    const res = await patchNode(admin, fx.nodes.module, {});
    assert.equal(res.body?.led_closed_count, 1, 'cancelled is not done (D-34b)');
  });

  test('a leaf counts nothing, so it reads differently from a parent with nothing done', async () => {
    const res = await patchNode(admin, fx.nodes.sub, {});
    assert.equal(res.body?.led_descendant_count, 0);
    assert.equal(res.body?.led_closed_count, 0);
  });
});
