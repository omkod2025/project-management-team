import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const slug = 'bannayuu-next';
const containerId = 'a2fc9acb-4712-42fc-8605-bc5151433c40';
const apply = process.argv.includes('--apply');
pg.types.setTypeParser(pg.types.builtins.DATE, value => value);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SET LOCAL lock_timeout = \'5s\'');
  if (apply) await client.query('LOCK TABLE pmt_defect_nodes IN SHARE ROW EXCLUSIVE MODE');
  const project = (await client.query('SELECT project_id FROM pmt_projects WHERE project_slug=$1 AND project_archived_at IS NULL', [slug])).rows;
  assert.equal(project.length, 1);
  const projectId = project[0].project_id;
  const before = (await client.query('SELECT * FROM pmt_defect_nodes WHERE node_project_id=$1 ORDER BY node_id FOR UPDATE', [projectId])).rows;
  const taskBefore = (await client.query('SELECT * FROM pmt_nodes WHERE node_project_id=$1 ORDER BY node_id FOR SHARE', [projectId])).rows;
  const root = before.find(n => n.node_depth === 1 && !n.node_archived_at);
  const container = before.find(n => n.node_id === containerId);
  assert.ok(root && container);
  assert.equal(container.node_depth, 2);
  assert.equal(container.node_parent_id, root.node_id);
  const children = before.filter(n => n.node_parent_id === containerId);
  assert.ok(children.length, 'No children left to promote; refusing repeated application.');
  for (const child of children) assert.equal(child.node_depth, 3);
  const moved = new Set(children.map(n => n.node_id));
  let added = true;
  while (added) {
    added = false;
    for (const node of before) {
      if (moved.has(node.node_parent_id) && !moved.has(node.node_id)) {
        moved.add(node.node_id); added = true;
      }
    }
  }
  console.log(JSON.stringify({ apply, slug, modules: children.map(n => ({ name: n.node_name, archived: !!n.node_archived_at })), affectedRows: moved.size }, null, 2));
  if (!apply) {
    await client.query('ROLLBACK');
  } else {
    mkdirSync('data', { recursive: true });
    const backup = `data/defect-promote-${Date.now()}.json`;
    writeFileSync(backup, JSON.stringify({ slug, containerId, before }, null, 2));
    // The standard move procedure visits only active descendants. This bulk
    // promotion also preserves archived branches for a consistent restore.
    await client.query(`UPDATE pmt_defect_nodes SET
      node_parent_id = CASE WHEN node_id = ANY($2::uuid[]) THEN $3::uuid ELSE node_parent_id END,
      node_depth = node_depth - 1, node_updated_at = now()
      WHERE node_id = ANY($1::uuid[])`, [[...moved], children.map(n => n.node_id), root.node_id]);
    const after = (await client.query('SELECT * FROM pmt_defect_nodes WHERE node_project_id=$1 ORDER BY node_id', [projectId])).rows;
    assert.equal(after.length, before.length);
    const childIds = new Set(children.map(n => n.node_id));
    for (let i = 0; i < before.length; i++) {
      const old = before[i];
      const expected = { ...old };
      if (moved.has(old.node_id)) {
        expected.node_depth--;
        expected.node_updated_at = after[i].node_updated_at;
        if (childIds.has(old.node_id)) expected.node_parent_id = root.node_id;
      }
      assert.deepEqual(after[i], expected);
    }
    const tasksAfter = (await client.query('SELECT * FROM pmt_nodes WHERE node_project_id=$1 ORDER BY node_id', [projectId])).rows;
    assert.deepEqual(tasksAfter, taskBefore, 'Task data must remain unchanged.');
    const ledger = (await client.query('SELECT * FROM pmf_defect_project_ledger($1)', [projectId])).rows;
    for (const child of children.filter(n => !n.node_archived_at)) {
      assert.equal(ledger.find(n => n.led_node_id === child.node_id)?.led_depth, 2);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ committed: true, backup, promotedModules: children.length, affectedRows: moved.size, taskUnchanged: true, emptyContainerRetained: true }));
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
