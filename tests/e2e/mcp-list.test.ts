/**
 * The List module over MCP (central MCP tokens design, Task 5).
 *
 * What it defends: a token reads the four dates as four fields and writes only
 * the one it names (CLAUDE.md, "The rule the product exists for"); a write
 * grant never outranks its owner's role; anything outside the token's
 * effective scope — another project, a defect, a malformed id, a parent across
 * the project line — is the same "Not found." and changes nothing; and the
 * scope follows membership, live.
 */

import test, { before, after, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let jar: Jar;
let viewerJar: Jar;
let rpcId = 0;
const tokens: string[] = [];
const peopleFieldId = randomUUID();
const other = { projectId: randomUUID(), root: randomUUID(), module: randomUUID(), task: randomUUID() };
const defect = { root: randomUUID(), module: randomUUID() };

async function api(method: string, path: string, body?: unknown, as = jar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers: { cookie: as.header, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function mint(grants: string[] = [], projectIds = [fx.projectId], as = jar) {
  const r = await api('POST', '/api/tokens', { label: 'MCP list test', grants: { list: grants }, scope: { projectIds } }, as);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  tokens.push(r.body.token.id);
  return r.body.secret as string;
}

async function rpc(secret: string, method: string, params?: unknown) {
  const r = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  return { status: r.status, body: await r.json() };
}

async function call(secret: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(secret, 'tools/call', { name, arguments: args });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.result, JSON.stringify(r.body));
  return r.body.result;
}

async function ok(secret: string, name: string, args: Record<string, unknown> = {}) {
  const r = await call(secret, name, args);
  assert.ok(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}

async function notFound(secret: string, name: string, args: Record<string, unknown>) {
  const r = await call(secret, name, args);
  assert.equal(r.isError, true, JSON.stringify(r));
  assert.equal(r.content[0].text, 'Not found.', `${name} ${JSON.stringify(args)}`);
}

async function toolNames(secret: string): Promise<string[]> {
  const r = await rpc(secret, 'tools/list', {});
  assert.ok(r.body.result, JSON.stringify(r.body));
  return (r.body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
}

/** One node's four dates, its parent and its values, straight from the table. */
async function row(nodeId: string) {
  const { rows } = await fx.client.query(
    `SELECT node_parent_id, node_name, node_estimate_start, node_estimate_end,
            node_actual_start, node_actual_end, node_custom_values
       FROM pmt_nodes WHERE node_id = $1`, [nodeId]);
  return rows[0];
}

async function resetTask() {
  await fx.client.query(
    `UPDATE pmt_nodes SET node_name = 'Task', node_parent_id = $2, node_estimate_start = '2026-09-01',
            node_estimate_end = '2026-09-10', node_actual_start = NULL, node_actual_end = NULL,
            node_actual_start_raw = NULL, node_actual_end_raw = NULL,
            node_actual_source_start = NULL, node_actual_source_end = NULL, node_custom_values = '{}'
      WHERE node_id = $1`, [fx.nodes.task, fx.nodes.module]);
}

before(async () => {
  fx = await setup();
  jar = await signIn(fx.admin.email, fx.admin.password);
  viewerJar = await signIn(fx.viewer.email, fx.viewer.password);

  // The harness has no people field; an assignment needs one (spec 11).
  await fx.client.query(
    `INSERT INTO pmt_field_definitions (field_id, field_project_id, field_name, field_kind, field_position, field_settings)
     VALUES ($1, $2, 'Owner', 'people', 2, '{}')`, [peopleFieldId, fx.projectId]);

  // A second project the admin also belongs to, for the scope boundary.
  const tag = randomBytes(4).toString('hex');
  await fx.client.query(
    `INSERT INTO pmt_projects (project_id, project_name, project_slug) VALUES ($1, $2, $3)`,
    [other.projectId, `E2E other ${tag}`, `e2e-other-${tag}`]);
  await fx.client.query(
    `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'admin')`,
    [other.projectId, fx.admin.id]);
  await fx.client.query(
    `INSERT INTO pmt_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name)
     VALUES ($1, $4, NULL, 1, 'Other project'), ($2, $4, $1, 2, 'Other module'), ($3, $4, $2, 3, 'Other task')`,
    [other.root, other.module, other.task, other.projectId]);

  // A defect in the fixture project: its id lives in pmt_defect_nodes, never pmt_nodes.
  await fx.client.query(
    `INSERT INTO pmt_defect_nodes (node_id, node_project_id, node_parent_id, node_depth, node_name)
     VALUES ($1, $3, NULL, 1, 'Defects'), ($2, $3, $1, 2, 'A defect')`,
    [defect.root, defect.module, fx.projectId]);
});

afterEach(async () => {
  if (tokens.length) await fx.client.query('DELETE FROM pmt_access_tokens WHERE access_token_id = ANY($1)', [tokens.splice(0)]);
  await resetTask();
});

after(async () => {
  if (!fx) return;
  await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id = $1', [fx.projectId]);
  await fx.client.query('DELETE FROM pmt_nodes WHERE node_project_id = $1', [other.projectId]);
  await fx.client.query('DELETE FROM pmt_projects WHERE project_id = $1', [other.projectId]);
  await fx.cleanup();
});

describe('List tools over MCP', () => {
  test('list_projects names only the projects in scope', async () => {
    const secret = await mint();
    const projects = await ok(secret, 'list_projects');
    assert.deepEqual(projects.map((p: { id: string }) => p.id), [fx.projectId]);
    assert.equal(projects[0].role, 'admin');
  });

  test('list_tasks returns estimate and actual as separate fields', async () => {
    await fx.client.query(`UPDATE pmt_nodes SET node_actual_start = '2026-09-03' WHERE node_id = $1`, [fx.nodes.task]);
    const secret = await mint();
    const tasks = await ok(secret, 'list_tasks', { project_id: fx.projectId });
    assert.ok(tasks.every((t: { depth: number }) => t.depth >= 2), 'the project root is not a task');
    const task = tasks.find((t: { id: string }) => t.id === fx.nodes.task);
    assert.equal(task.parentId, fx.nodes.module);
    assert.equal(task.name, 'Task');
    assert.equal(task.estimateStart, '2026-09-01');
    assert.equal(task.estimateEnd, '2026-09-10');
    assert.equal(task.actualStart, '2026-09-03');
    assert.equal(task.actualEnd, null);
    assert.deepEqual(task.values, {});

    const one = await ok(secret, 'read_task', { task_id: fx.nodes.task.toUpperCase() });
    assert.equal(one.id, fx.nodes.task);
    assert.equal(one.projectId, fx.projectId);
    assert.equal(one.actualStart, '2026-09-03');
  });

  test('create_task needs the grant', async () => {
    const readOnly = await mint([]);
    const names = await toolNames(readOnly);
    assert.deepEqual(names, ['list_projects', 'list_tasks', 'read_task']);

    const secret = await mint(['create_task']);
    assert.ok((await toolNames(secret)).includes('create_task'));
    assert.ok(!(await toolNames(secret)).includes('update_task'));
    const created = await ok(secret, 'create_task', { parent_id: fx.nodes.module, name: 'งานจาก MCP', after_id: fx.nodes.task });
    assert.equal(created.name, 'งานจาก MCP');
    const { rows } = await fx.client.query(
      'SELECT node_project_id, node_parent_id FROM pmt_nodes WHERE node_id = $1', [created.id]);
    assert.equal(rows[0].node_project_id, fx.projectId);
    assert.equal(rows[0].node_parent_id, fx.nodes.module);
  });

  test('update_task writes only what it is given', async () => {
    const secret = await mint(['write_task']);
    const before = await row(fx.nodes.task);

    const first = await ok(secret, 'update_task', { task_id: fx.nodes.task, estimate_end: '2026-09-11' });
    assert.equal(first.estimateEnd, '2026-09-11');
    const afterEstimate = await row(fx.nodes.task);
    assert.equal(afterEstimate.node_estimate_end, '2026-09-11');
    assert.equal(afterEstimate.node_actual_end, before.node_actual_end);
    assert.equal(afterEstimate.node_actual_start, before.node_actual_start);

    await ok(secret, 'update_task', { task_id: fx.nodes.task, actual_start: '2026-09-02' });
    const afterActual = await row(fx.nodes.task);
    assert.equal(afterActual.node_actual_start, '2026-09-02');
    assert.equal(afterActual.node_estimate_start, before.node_estimate_start);
    assert.equal(afterActual.node_estimate_end, '2026-09-11');

    const mixed = await call(secret, 'update_task', { task_id: fx.nodes.task, name: 'x', parent_id: fx.nodes.module2 });
    assert.equal(mixed.isError, true);
    assert.equal(JSON.parse(mixed.content[0].text).error.code, 'E_INVALID_DOC');
    assert.equal((await row(fx.nodes.task)).node_parent_id, fx.nodes.module);

    const moved = await ok(secret, 'update_task', { task_id: fx.nodes.task, parent_id: fx.nodes.module2 });
    assert.equal(moved.parentId, fx.nodes.module2);
  });

  test('a viewer owner’s write grant cannot write', async () => {
    const secret = await mint(['create_task', 'write_task'], [fx.projectId], viewerJar);
    const before = await row(fx.nodes.task);
    const { rows: [{ n: count }] } = await fx.client.query(
      'SELECT count(*)::int AS n FROM pmt_nodes WHERE node_project_id = $1', [fx.projectId]);

    const edit = await call(secret, 'update_task', { task_id: fx.nodes.task, estimate_end: '2026-09-11', name: 'x' });
    assert.equal(edit.isError, true);
    assert.equal(JSON.parse(edit.content[0].text).error.code, 'E_FORBIDDEN');
    const create = await call(secret, 'create_task', { parent_id: fx.nodes.module, name: 'x' });
    assert.equal(create.isError, true);
    assert.equal(JSON.parse(create.content[0].text).error.code, 'E_FORBIDDEN');

    assert.deepEqual(await row(fx.nodes.task), before);
    const { rows: [{ n: after }] } = await fx.client.query(
      'SELECT count(*)::int AS n FROM pmt_nodes WHERE node_project_id = $1', [fx.projectId]);
    assert.equal(after, count);
  });

  test('out of scope is Not found.', async () => {
    const secret = await mint(['create_task', 'write_task']);
    const both = await mint(['create_task', 'write_task'], [fx.projectId, other.projectId]);
    const before = { task: await row(fx.nodes.task), other: await row(other.task) };
    const { rows: [{ n: count }] } = await fx.client.query(
      'SELECT count(*)::int AS n FROM pmt_nodes WHERE node_project_id = ANY($1)', [[fx.projectId, other.projectId]]);

    // A task in a project the token does not scope.
    await notFound(secret, 'read_task', { task_id: other.task });
    await notFound(secret, 'update_task', { task_id: other.task, name: 'x' });
    await notFound(secret, 'create_task', { parent_id: other.module, name: 'x' });
    await notFound(secret, 'list_tasks', { project_id: other.projectId });
    // A defect in a scoped project.
    await notFound(secret, 'read_task', { task_id: defect.module });
    await notFound(secret, 'update_task', { task_id: defect.module, name: 'x' });
    await notFound(secret, 'create_task', { parent_id: defect.module, name: 'x' });
    // Malformed, and unknown.
    await notFound(secret, 'read_task', { task_id: 'x' });
    await notFound(secret, 'update_task', { task_id: randomUUID(), name: 'x' });
    // A move across the project line, though the token scopes both sides.
    await notFound(both, 'update_task', { task_id: fx.nodes.task, parent_id: other.module });
    await notFound(both, 'update_task', { task_id: fx.nodes.task, parent_id: defect.module });

    assert.deepEqual(await row(fx.nodes.task), before.task);
    assert.deepEqual(await row(other.task), before.other);
    const { rows: [{ n: after }] } = await fx.client.query(
      'SELECT count(*)::int AS n FROM pmt_nodes WHERE node_project_id = ANY($1)', [[fx.projectId, other.projectId]]);
    assert.equal(after, count);
  });

  test('losing membership stops the token, rejoining restores it', async () => {
    const secret = await mint();
    assert.equal((await ok(secret, 'read_task', { task_id: fx.nodes.task })).id, fx.nodes.task);
    await fx.client.query(
      'DELETE FROM pmt_project_members WHERE member_project_id = $1 AND member_user_id = $2', [fx.projectId, fx.admin.id]);
    try {
      await notFound(secret, 'read_task', { task_id: fx.nodes.task });
      assert.deepEqual(await ok(secret, 'list_projects'), []);
    } finally {
      await fx.client.query(
        `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'admin')`,
        [fx.projectId, fx.admin.id]);
    }
    assert.equal((await ok(secret, 'read_task', { task_id: fx.nodes.task })).id, fx.nodes.task);
  });

  test('assigning a person through update_task notifies them', async () => {
    await fx.client.query('DELETE FROM pmt_notifications WHERE notification_project_id = $1', [fx.projectId]);
    const secret = await mint(['write_task']);
    const updated = await ok(secret, 'update_task', { task_id: fx.nodes.task, values: { [peopleFieldId]: [fx.viewer.id] } });
    assert.deepEqual(updated.values[peopleFieldId], [fx.viewer.id]);
    const { rows } = await fx.client.query(
      `SELECT notification_actor_id FROM pmt_notifications
        WHERE notification_user_id = $1 AND notification_node_id = $2`, [fx.viewer.id, fx.nodes.task]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].notification_actor_id, fx.admin.id);
  });
});
