import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, signIn, BASE_URL, type Jar } from '../helpers/harness.ts';

test('Defect lifecycle, settings, permissions and Task isolation', async t => {
  const fx = await setup();
  const admin = await signIn(fx.admin.email, fx.admin.password);
  const viewer = await signIn(fx.viewer.email, fx.viewer.password);
  const request = async (path: string, method = 'GET', body?: unknown, jar: Jar | null = admin) => {
    const res = await fetch(`${BASE_URL}/api/${path}`, {
      method, headers: { ...(jar ? { cookie: jar.header } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const base = `defects/projects/${fx.projectId}`;
  let root = '', module = '', defect = '', sub = '', other = '', status = '', done = '';
  const taskBefore = (await fx.client.query('SELECT * FROM pmf_project_ledger($1)', [fx.projectId])).rows;
  try {
    await fx.client.query('UPDATE pmt_projects SET project_column_order = $2 WHERE project_id = $1', [fx.projectId, JSON.stringify([fx.budgetFieldId, fx.statusFieldId, 'estimate'])]);
    await t.test('unauthenticated reads cannot initialize a defect list', async () => {
      assert.equal((await request(`${base}/ledger`, 'GET', undefined, null)).status, 401);
      assert.equal((await fx.client.query('SELECT * FROM pmt_defect_settings WHERE defect_project_id=$1', [fx.projectId])).rowCount, 0);
    });
    await t.test('concurrent first reads create one empty root and independent field/option IDs', async () => {
      const reads = await Promise.all(Array.from({ length: 4 }, () => request(`${base}/ledger`)));
      for (const res of reads) { assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.body.length, 1); }
      root = reads[0]!.body[0].led_node_id;
      assert.notEqual(root, fx.nodes.root);
      const settings = await request(`${base}/fields`);
      assert.equal(settings.status, 200, JSON.stringify(settings.body));
      assert.equal(settings.body.fields.length, 2);
      status = settings.body.project.statusFieldId;
      assert.notEqual(status, fx.statusFieldId);
      const field = settings.body.fields.find((f: { id: string }) => f.id === status);
      assert.equal(field.options.length, 5);
      assert.ok(field.options.every((o: { id: string }) => !Object.values(fx.options).includes(o.id)));
      done = field.options.find((o: { stage: string }) => o.stage === 'done').id;
      const config = (await fx.client.query('SELECT * FROM pmt_defect_settings WHERE defect_project_id=$1', [fx.projectId])).rows[0];
      const budget = settings.body.fields.find((f: { kind: string }) => f.kind === 'money');
      assert.deepEqual(config.defect_column_order, [budget.id, status, 'estimate']);
      assert.equal(budget.settings.currency, 'USD');
    });
    await t.test('module, defect and nested defects have their own tree', async () => {
      const create = async (parentId: string, name: string) => {
        const res = await request('defects/nodes', 'POST', { parentId, name });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        return res.body.led_node_id as string;
      };
      module = await create(root, 'Defect module');
      other = await create(root, 'Other defect module');
      defect = await create(module, 'Broken login');
      sub = await create(defect, 'Nested defect');
      assert.equal((await fx.client.query('SELECT * FROM pmt_nodes WHERE node_id=$1', [defect])).rowCount, 0);
      assert.equal((await request(`nodes/${defect}`)).status, 404);
      assert.equal((await request(`defects/nodes/${fx.nodes.task}`)).status, 404);
      assert.equal((await request('defects/nodes', 'POST', { parentId: fx.nodes.module, name: 'Cross store' })).status, 404);
    });
    await t.test('viewer reads but cannot create, edit, archive or configure', async () => {
      assert.equal((await request(`${base}/ledger`, 'GET', undefined, viewer)).status, 200);
      assert.equal((await request('defects/nodes', 'POST', { parentId: module, name: 'Denied' }, viewer)).status, 403);
      assert.equal((await request(`defects/nodes/${defect}`, 'PATCH', {}, viewer)).status, 403);
      assert.equal((await request(`defects/nodes/${defect}`, 'DELETE', undefined, viewer)).status, 403);
      assert.equal((await request(`${base}/fields`, 'POST', { name: 'Denied', kind: 'text' }, viewer)).status, 403);
      assert.equal((await request(base, 'PATCH', { columnOrder: [] }, viewer)).status, 403);
    });
    await t.test('date capture and closed counts use only Defect status and descendants', async () => {
      const res = await request(`defects/nodes/${sub}`, 'PATCH', { estimateStart: '2026-10-01', estimateEnd: '2026-10-09', values: { [status]: done } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.led_estimate_start, '2026-10-01');
      assert.ok(res.body.led_actual_end);
      assert.equal(res.body.led_source_end, 'auto');
      const rows = (await request(`${base}/ledger`)).body;
      assert.equal(rows.find((r: { led_node_id: string }) => r.led_node_id === defect).led_closed_count, 1);
      assert.equal((await request(`defects/nodes/${defect}`, 'PATCH', { values: { [fx.statusFieldId]: fx.options.done } })).status, 422);
    });
    await t.test('move carries descendants and refuses cycles or Task parents', async () => {
      assert.equal((await request(`defects/nodes/${defect}`, 'PATCH', { parentId: other, afterId: null })).status, 200);
      const rows = (await request(`${base}/ledger`)).body;
      assert.equal(rows.find((r: { led_node_id: string }) => r.led_node_id === defect).led_parent_id, other);
      assert.equal(rows.find((r: { led_node_id: string }) => r.led_node_id === sub).led_depth, 4);
      assert.equal((await request(`defects/nodes/${defect}`, 'PATCH', { parentId: sub })).status, 422);
      assert.equal((await request(`defects/nodes/${defect}`, 'PATCH', { parentId: fx.nodes.module })).status, 404);
    });
    await t.test('Defect columns, status options and layout change independently', async () => {
      const field = await request(`${base}/fields`, 'POST', { name: 'Severity', kind: 'select' });
      assert.equal(field.status, 200, JSON.stringify(field.body));
      const option = await request(`defects/fields/${field.body.id}/options`, 'POST', { label: 'Critical', colorIndex: 2 });
      assert.equal(option.status, 200, JSON.stringify(option.body));
      assert.equal((await request(`defects/options/${done}`, 'PATCH', { label: 'Verified' })).status, 200);
      assert.equal((await request(`defects/fields/${field.body.id}`, 'PATCH', { name: 'Impact' })).status, 200);
      assert.equal((await request(base, 'PATCH', { columnOrder: [field.body.id, 'estimate'] })).status, 200);
      assert.equal((await request(base, 'PATCH', { statusFieldId: fx.statusFieldId })).status, 422);
      const tasks = (await request(`projects/${fx.projectId}/fields`)).body;
      assert.equal(tasks.fields.length, 2);
      assert.equal(tasks.fields.find((f: { id: string }) => f.id === fx.statusFieldId).options.find((o: { id: string }) => o.id === fx.options.done).label, 'DONE');
      assert.deepEqual((await fx.client.query('SELECT project_column_order FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_column_order, [fx.budgetFieldId, fx.statusFieldId, 'estimate']);
      // Opening again must never recopy Task configuration over Defect edits.
      assert.equal((await request(`${base}/fields`)).body.fields.length, 3);
    });
    await t.test('assignment notifications link to the Defect tab and can be marked read', async () => {
      const field = await request(`${base}/fields`, 'POST', { name: 'Assignee', kind: 'people' });
      const res = await request(`defects/nodes/${defect}`, 'PATCH', { values: { [field.body.id]: [fx.viewer.id] } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const notices = await request('notifications', 'GET', undefined, viewer);
      const list = notices.body.items ?? notices.body.notifications ?? notices.body;
      const item = list.find((n: { nodeId: string }) => n.nodeId === defect);
      assert.ok(item, JSON.stringify(notices.body));
      assert.match(item.href, /\/defects\?node=/);
      const taskInbox = await request('notifications?kind=task', 'GET', undefined, viewer);
      assert.equal(taskInbox.body.items.length, 0);
      assert.equal(taskInbox.body.unread, 0);
      const defectInbox = await request('notifications?kind=defect', 'GET', undefined, viewer);
      assert.equal(defectInbox.body.items.length, 1);
      assert.equal(defectInbox.body.unread, 1);
      await request('notifications?kind=task', 'POST', {}, viewer);
      assert.equal((await request('notifications?kind=defect&count=1', 'GET', undefined, viewer)).body.unread, 1);
      await request(`notifications/${item.id}?kind=task`, 'POST', {}, viewer);
      assert.equal((await request('notifications?kind=defect&count=1', 'GET', undefined, viewer)).body.unread, 1);
      assert.equal((await request(`notifications/${item.id}`, 'POST', {}, viewer)).status, 200);
    });
    await t.test('archive and restore affect the Defect subtree only', async () => {
      const res = await request(`defects/nodes/${defect}`, 'DELETE');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.archived, 2);
      assert.ok(!(await request(`${base}/ledger`)).body.some((r: { led_node_id: string }) => r.led_node_id === sub));
      assert.equal((await request(`defects/nodes/${defect}/restore`, 'POST')).status, 200);
      assert.ok((await request(`${base}/ledger`)).body.some((r: { led_node_id: string }) => r.led_node_id === sub));
      assert.deepEqual((await fx.client.query('SELECT * FROM pmf_project_ledger($1)', [fx.projectId])).rows, taskBefore);
    });
  } finally {
    await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
