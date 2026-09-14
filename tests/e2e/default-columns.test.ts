/**
 * What a brand-new project arrives with (D-35).
 *
 * The unit tests next door prove the default option set is well formed. Only
 * this one proves the rows are actually written, in the right order, and that
 * the Status column is designated — which is the part that changes behaviour,
 * because designation is what turns on automatic actual capture (D-13).
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { DEFAULT_COLUMNS, DEFAULT_SIDE_OPTIONS, DEFAULT_STATUS_OPTIONS } from '../../src/lib/admin-rules.ts';

let fx: Fixture;
let admin: Jar;
const created: string[] = [];

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
});

after(async () => {
  for (const id of created) {
    await fx.client.query('DELETE FROM pmt_nodes WHERE node_project_id = $1', [id]);
    await fx.client.query('DELETE FROM pmt_projects WHERE project_id = $1', [id]);
  }
  await fx?.cleanup();
});

async function call(jar: Jar | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(jar ? { cookie: jar.header } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

async function newProject(name: string) {
  const res = await call(admin, 'POST', '/api/projects', { name });
  assert.equal(res.status, 200, `project create failed: ${JSON.stringify(res.body)}`);
  const id = (res.body as { id: string }).id;
  created.push(id);
  return id;
}

describe('a new project starts with its default columns', () => {
  test('every column exists, in order, with the kind it needs', async () => {
    const id = await newProject('Default columns E2E');
    const res = await call(admin, 'GET', `/api/projects/${id}/fields`);
    const { fields } = res.body as unknown as { fields: { id: string; name: string; kind: string }[] };

    assert.deepEqual(fields.map((f) => f.name), ['Status', 'Assign', 'Side', 'Description']);
    assert.deepEqual(fields.map((f) => f.kind), DEFAULT_COLUMNS.map((c) => c.kind));
  });

  test('the Status column is designated, so D-13 capture is live from the first task', async () => {
    const id = await newProject('Designated status E2E');
    const [row] = (await fx.client.query(
      'SELECT project_status_field_id FROM pmt_projects WHERE project_id = $1', [id],
    )).rows as { project_status_field_id: string | null }[];

    const [status] = (await fx.client.query(
      `SELECT field_id FROM pmt_field_definitions
        WHERE field_project_id = $1 AND field_name = 'Status'`, [id],
    )).rows as { field_id: string }[];

    assert.equal(row!.project_status_field_id, status!.field_id);
  });

  test('the five options are written in order, with only two carrying a stage', async () => {
    const id = await newProject('Status options E2E');
    const rows = (await fx.client.query(
      `SELECT o.option_label, o.option_stage, o.option_color_index
         FROM pmt_field_options o
         JOIN pmt_field_definitions f ON f.field_id = o.option_field_id
        WHERE f.field_project_id = $1 AND f.field_name = 'Status'
        ORDER BY o.option_position`, [id],
    )).rows as { option_label: string; option_stage: string | null; option_color_index: number }[];

    assert.deepEqual(
      rows.map((r) => [r.option_label, r.option_stage, r.option_color_index]),
      DEFAULT_STATUS_OPTIONS.map((o) => [o.label, o.stage, o.colorIndex]),
    );
  });

  test('Side arrives with all its options, and Description with none', async () => {
    const id = await newProject('Side and description E2E');
    const rows = (await fx.client.query(
      `SELECT f.field_name, o.option_label, o.option_stage
         FROM pmt_field_definitions f
         LEFT JOIN pmt_field_options o ON o.option_field_id = f.field_id
        WHERE f.field_project_id = $1 AND f.field_name IN ('Side', 'Description')
        ORDER BY f.field_position, o.option_position`, [id],
    )).rows as { field_name: string; option_label: string | null; option_stage: string | null }[];

    assert.deepEqual(
      rows.filter((r) => r.field_name === 'Side').map((r) => [r.option_label, r.option_stage]),
      DEFAULT_SIDE_OPTIONS.map((o) => [o.label, o.stage]),
    );
    // A long text column has no options, so the outer join leaves one NULL row.
    assert.deepEqual(rows.filter((r) => r.field_name === 'Description').map((r) => r.option_label), [null]);
  });

  test('the List opens with Assign and Side beside Status, ahead of the bands', async () => {
    const id = await newProject('Column order E2E');
    const fields = (await fx.client.query(
      `SELECT field_id, field_name FROM pmt_field_definitions
        WHERE field_project_id = $1`, [id],
    )).rows as { field_id: string; field_name: string }[];
    const idOf = (name: string) => fields.find((f) => f.field_name === name)!.field_id;

    const [project] = (await fx.client.query(
      'SELECT project_column_order FROM pmt_projects WHERE project_id = $1', [id],
    )).rows as { project_column_order: string[] }[];

    assert.deepEqual(project!.project_column_order, [
      idOf('Status'), idOf('Assign'), idOf('Side'),
      'estimate', 'actual', 'variance', 'progress',
      idOf('Description'),
    ]);
  });

  test('a second project gets its own columns, not a shared set', async () => {
    const first = await newProject('Separate columns A E2E');
    const second = await newProject('Separate columns B E2E');
    const ids = (await fx.client.query(
      'SELECT field_id FROM pmt_field_definitions WHERE field_project_id = ANY($1)', [[first, second]],
    )).rows as { field_id: string }[];

    const expected = DEFAULT_COLUMNS.length * 2;
    assert.equal(ids.length, expected);
    assert.equal(new Set(ids.map((r) => r.field_id)).size, expected);
  });
});
