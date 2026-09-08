/**
 * Administration through the HTTP API (T8).
 *
 * The interesting tests here are the refusals: each one prevents a state the
 * UI could not get you back out of.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setup, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
let admin: Jar;
let viewer: Jar;

before(async () => {
  fx = await setup();
  admin = await signIn(fx.admin.email, fx.admin.password);
  viewer = await signIn(fx.viewer.email, fx.viewer.password);
});
after(async () => { await fx?.cleanup(); });

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

type FieldRow = { id: string; name: string; archived: boolean };
type MemberRow = { userId: string; role: string };

async function settings() {
  const res = await call(admin, 'GET', `/api/projects/${fx.projectId}/fields`);
  return res.body as unknown as { fields: FieldRow[]; members: MemberRow[] };
}

/* ================================================================== roles */

describe('everything here is admin-only', () => {
  test('a viewer cannot read the settings', async () => {
    assert.equal((await call(viewer, 'GET', `/api/projects/${fx.projectId}/fields`)).status, 403);
  });

  test('a viewer cannot add a column', async () => {
    const res = await call(viewer, 'POST', `/api/projects/${fx.projectId}/fields`, { name: 'X', kind: 'text' });
    assert.equal(res.status, 403);
  });

  test('signed out is 401, not 403', async () => {
    assert.equal((await call(null, 'GET', `/api/projects/${fx.projectId}/fields`)).status, 401);
  });
});

/* ================================================================ columns */

describe('columns', () => {
  let fieldId = '';

  test('an admin can add one, and the name is trimmed', async () => {
    const res = await call(admin, 'POST', `/api/projects/${fx.projectId}/fields`, {
      name: '  Client Feedback  ', kind: 'text',
    });
    assert.equal(res.status, 200);
    fieldId = String(res.body?.id);

    const s = await settings();
    assert.equal(s.fields.find((f) => f.id === fieldId)?.name, 'Client Feedback');
  });

  test('an unknown type is refused', async () => {
    const res = await call(admin, 'POST', `/api/projects/${fx.projectId}/fields`, {
      name: 'Formula', kind: 'formula',
    });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_UNKNOWN_FIELD');
  });

  test('D-31 — the type cannot be changed afterwards', async () => {
    const res = await call(admin, 'PATCH', `/api/fields/${fieldId}`, { kind: 'number' });
    assert.equal(res.status, 409);
    assert.equal(res.body?.code, 'E_FIELD_TYPE_IMMUTABLE');
  });

  test('a column is archived, never deleted, and can come back', async () => {
    assert.equal((await call(admin, 'PATCH', `/api/fields/${fieldId}`, { archived: true })).status, 200);
    assert.equal((await settings()).fields.find((f) => f.id === fieldId)?.archived, true);

    assert.equal((await call(admin, 'PATCH', `/api/fields/${fieldId}`, { archived: false })).status, 200);
    assert.equal((await settings()).fields.find((f) => f.id === fieldId)?.archived, false);
  });
});

/* =============================================================== renaming */

describe('renaming the project', () => {
  test('an admin renames it, and the name is trimmed', async () => {
    const res = await call(admin, 'PATCH', `/api/projects/${fx.projectId}`, {
      name: '  Renamed by the suite  ',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.name, 'Renamed by the suite');
  });

  test('the root node follows, so the breadcrumb does not show the old name', async () => {
    const { rows } = await fx.client.query(
      `SELECT node_name FROM pmt_nodes WHERE node_project_id = $1 AND node_depth = 1`,
      [fx.projectId],
    );
    assert.equal(rows[0].node_name, 'Renamed by the suite');
  });

  test('the slug does not follow — every link already handed out still works', async () => {
    const { rows } = await fx.client.query(
      'SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId],
    );
    assert.match(String(rows[0].project_slug), /^e2e-/, 'the address is where it was');
  });

  test('an empty name is refused, rather than saved as a blank shelf entry', async () => {
    const res = await call(admin, 'PATCH', `/api/projects/${fx.projectId}`, { name: '   ' });
    assert.equal(res.status, 422);

    const { rows } = await fx.client.query(
      'SELECT project_name FROM pmt_projects WHERE project_id = $1', [fx.projectId],
    );
    assert.equal(rows[0].project_name, 'Renamed by the suite', 'and nothing changed');
  });

  test('a viewer cannot rename it', async () => {
    const res = await call(viewer, 'PATCH', `/api/projects/${fx.projectId}`, { name: 'Viewer was here' });
    assert.equal(res.status, 403);
  });
});

/* ========================================================== status column */

describe('the status column (D-35)', () => {
  test('only a select can be it', async () => {
    const res = await call(admin, 'PATCH', `/api/projects/${fx.projectId}`, {
      statusFieldId: fx.budgetFieldId,               // money
    });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_STATUS_FIELD_TYPE');
  });

  test('it cannot be archived while it holds the designation', async () => {
    const res = await call(admin, 'PATCH', `/api/fields/${fx.statusFieldId}`, { archived: true });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_STATUS_FIELD_TYPE');
  });

  test('it must keep an option marked done, or finished work is never recorded', async () => {
    const res = await call(admin, 'PATCH', `/api/options/${fx.options.done}`, { stage: '' });
    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'E_STATUS_FIELD_TYPE');
  });

  test('and archiving that option fails for the same reason', async () => {
    const res = await call(admin, 'PATCH', `/api/options/${fx.options.done}`, { archived: true });
    assert.equal(res.status, 422);
  });

  test('a second done option makes both changes possible again', async () => {
    const added = await call(admin, 'POST', `/api/fields/${fx.statusFieldId}/options`, {
      label: 'SHIPPED', stage: 'done',
    });
    assert.equal(added.status, 200);
    assert.equal((await call(admin, 'PATCH', `/api/options/${fx.options.done}`, { archived: true })).status, 200);
  });

  test('an unknown stage is refused', async () => {
    const res = await call(admin, 'PATCH', `/api/options/${fx.options.backlog}`, { stage: 'finished' });
    assert.equal(res.status, 422);
  });

  test('a colour outside the six tab hues is refused', async () => {
    const res = await call(admin, 'PATCH', `/api/options/${fx.options.backlog}`, { colorIndex: 9 });
    assert.equal(res.status, 422);
  });
});

/* ================================================================ members */

describe('members', () => {
  test('a role can be changed', async () => {
    const res = await call(admin, 'POST', `/api/projects/${fx.projectId}/members`, {
      userId: fx.viewer.id, role: 'member',
    });
    assert.equal(res.status, 200);
    assert.equal((await settings()).members.find((m) => m.userId === fx.viewer.id)?.role, 'member');
  });

  test('an invented role is refused', async () => {
    const res = await call(admin, 'POST', `/api/projects/${fx.projectId}/members`, {
      userId: fx.viewer.id, role: 'owner',
    });
    assert.equal(res.status, 403);
  });

  test('the last admin cannot demote themselves out of the project', async () => {
    const res = await call(admin, 'POST', `/api/projects/${fx.projectId}/members`, {
      userId: fx.admin.id, role: 'viewer',
    });
    assert.equal(res.status, 403);
    assert.match(String(res.body?.message), /at least one admin/i);
  });

  test('nor remove themselves', async () => {
    const res = await call(admin, 'DELETE', `/api/projects/${fx.projectId}/members?userId=${fx.admin.id}`);
    assert.equal(res.status, 403);
  });

  test('promoting someone else first makes it possible', async () => {
    assert.equal((await call(admin, 'POST', `/api/projects/${fx.projectId}/members`, {
      userId: fx.viewer.id, role: 'admin',
    })).status, 200);
    assert.equal((await call(admin, 'POST', `/api/projects/${fx.projectId}/members`, {
      userId: fx.admin.id, role: 'viewer',
    })).status, 200);
  });
});

/* =============================================================== calendar */

describe('the working-day calendar', () => {
  const day = '2031-02-17';

  before(async () => {
    // The original admin demoted itself above, so sign in as the new one.
    admin = await signIn(fx.viewer.email, fx.viewer.password);
  });

  after(async () => {
    await fx.client.query('DELETE FROM pmt_holidays WHERE holiday_date = $1', [day]);
  });

  test('a holiday can be added and removed', async () => {
    assert.equal((await call(admin, 'POST', '/api/holidays', {
      projectId: fx.projectId, date: day, name: 'Test Day',
    })).status, 200);

    const { rows } = await fx.client.query(
      'SELECT holiday_name FROM pmt_holidays WHERE holiday_date = $1', [day],
    );
    assert.equal(rows[0]?.holiday_name, 'Test Day');

    assert.equal((await call(admin, 'DELETE', `/api/holidays?projectId=${fx.projectId}&date=${day}`)).status, 200);
  });

  test('a malformed date is refused', async () => {
    const res = await call(admin, 'POST', '/api/holidays', {
      projectId: fx.projectId, date: '17/02/2031', name: 'Nope',
    });
    assert.equal(res.status, 422);
  });
});

/* ================================================================== users */

describe('creating a person', () => {
  test('returns a one-time token and leaves the account unable to sign in', async () => {
    const email = `e2e-new-${Date.now()}@test.invalid`;
    const res = await call(admin, 'POST', '/api/users', { projectId: fx.projectId, email });
    assert.equal(res.status, 200);
    assert.ok(String(res.body?.token).length > 20);

    const { rows } = await fx.client.query(
      'SELECT user_password_hash, user_setup_token FROM pmt_users WHERE user_email = $1',
      [email],
    );
    assert.equal(rows[0]?.user_password_hash, null, 'an unclaimed account cannot sign in');
    assert.ok(rows[0]?.user_setup_token);

    await fx.client.query('DELETE FROM pmt_users WHERE user_email = $1', [email]);
  });

  test('a duplicate address is refused', async () => {
    const res = await call(admin, 'POST', '/api/users', { projectId: fx.projectId, email: fx.admin.email });
    assert.equal(res.status, 422);
  });

  test('nonsense is refused', async () => {
    const res = await call(admin, 'POST', '/api/users', { projectId: fx.projectId, email: 'not-an-address' });
    assert.equal(res.status, 422);
  });
});
