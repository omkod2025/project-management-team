/**
 * System-wide access tokens through the session API (`/api/tokens`), central
 * MCP tokens design: grants per module, scope per kind, and the two rules
 * that keep scope honest — scope only ever follows a granted module, and an
 * edit never touches scope the owner cannot see right now.
 *
 * Runs against `npm run dev` and the database in `.env`. It makes its own
 * project, users and wikis, and deletes them afterwards.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';

let fx: Fixture;
type U = { id: string; email: string; password: string };
type Row = {
  id: string; label: string; grants: Record<string, string[]>;
  projects: Array<{ id: string; name: string }>; wikis: Array<{ id: string; title: string }>;
  [field: string]: unknown;
};

let owner: U;
let ownerJar: Jar;
let wikiId = '';
/** A project the owner is not a member of. */
let hiddenProject = '';
const wikiIds: string[] = [];

before(async () => {
  fx = await setup();
  owner = await makeUser(fx.client, 'tokens');
  await fx.client.query(
    "INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'member')",
    [fx.projectId, owner.id],
  );
  hiddenProject = randomUUID();
  await fx.client.query(
    'INSERT INTO pmt_projects (project_id, project_name, project_slug) VALUES ($1, $2, $3)',
    [hiddenProject, 'E2E hidden', `e2e-hidden-${randomBytes(4).toString('hex')}`],
  );
  ownerJar = await signIn(owner.email, owner.password);
  const w = await call(ownerJar, 'POST', '/api/wikis', { title: 'วิกิของโทเค็น', description: '' });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  wikiId = w.body.id;
  wikiIds.push(wikiId);
});

after(async () => {
  if (fx) {
    if (wikiIds.length) await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_id = ANY($1)', [wikiIds]);
    if (hiddenProject) await fx.client.query('DELETE FROM pmt_projects WHERE project_id = $1', [hiddenProject]);
  }
  await fx?.cleanup();
});

async function call(jar: Jar | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(jar ? { cookie: jar.header } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function mint(body: Record<string, unknown>, jar = ownerJar): Promise<Row> {
  const res = await call(jar, 'POST', '/api/tokens', { label: 'โทเค็น', ...body });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token as Row;
}

async function listed(tokenId: string, jar = ownerJar): Promise<Row> {
  const list = await call(jar, 'GET', '/api/tokens');
  assert.equal(list.status, 200);
  const row = (list.body as Row[]).find((t) => t.id === tokenId);
  assert.ok(row, 'the token is in the list');
  return row;
}

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);

async function setMembership(present: boolean) {
  if (present) {
    await fx.client.query(
      "INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
      [fx.projectId, owner.id],
    );
  } else {
    await fx.client.query(
      'DELETE FROM pmt_project_members WHERE member_project_id = $1 AND member_user_id = $2', [fx.projectId, owner.id],
    );
  }
}

async function projectScopeRows(tokenId: string): Promise<number> {
  const { rows } = await fx.client.query(
    'SELECT count(*)::int AS n FROM pmt_access_token_scopes WHERE token_scope_token_id = $1 AND token_scope_project_id IS NOT NULL',
    [tokenId],
  );
  return rows[0].n as number;
}

describe('/api/tokens', () => {
  test('create returns the secret once and the row with grants and scope', async () => {
    const grants = { list: ['create_task', 'write_task'], wiki: [] };
    const res = await call(ownerJar, 'POST', '/api/tokens', {
      label: 'โทเค็นทีม', grants, scope: { projectIds: [fx.projectId], wikiIds: [wikiId] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.secret, /^pmw_/);
    const token = res.body.token as Row;
    assert.deepEqual(token.grants, grants);
    assert.deepEqual(ids(token.projects), [fx.projectId]);
    assert.deepEqual(ids(token.wikis), [wikiId]);
    assert.equal(token.status, 'active');
    assert.equal(token.ownerId, owner.id);

    const list = await call(ownerJar, 'GET', '/api/tokens');
    assert.equal(list.status, 200);
    const raw = JSON.stringify(list.body);
    assert.ok(!raw.includes('"secret"'));
    assert.ok(!raw.includes(res.body.secret));
    assert.deepEqual((await listed(token.id)).grants, grants);
  });

  test('scope of a kind no module uses is dropped', async () => {
    const token = await mint({ grants: { wiki: [] }, scope: { projectIds: [fx.projectId] } });
    assert.deepEqual(token.projects, []);
    assert.equal(await projectScopeRows(token.id), 0);
  });

  test('an invisible or malformed project id is 404', async () => {
    for (const projectId of [hiddenProject, 'nope']) {
      const res = await call(ownerJar, 'POST', '/api/tokens', {
        label: 'x', grants: { list: [] }, scope: { projectIds: [projectId] },
      });
      assert.equal(res.status, 404, `${projectId} answered ${res.status}`);
    }
  });

  test('an unknown module or permission is refused', async () => {
    assert.equal((await call(ownerJar, 'POST', '/api/tokens', { label: 'x', grants: { mail: [] } })).status, 422);
    assert.equal((await call(ownerJar, 'POST', '/api/tokens', { label: 'x', grants: { list: ['read'] } })).status, 422);
    assert.equal((await call(ownerJar, 'POST', '/api/tokens', { label: 'x', grants: ['list'] })).status, 422);
  });

  test('PATCH without grants keeps them; with {} removes every module', async () => {
    const token = await mint({ grants: { list: ['write_task'], wiki: ['create_page'] }, scope: { projectIds: [fx.projectId], wikiIds: [wikiId] } });
    const renamed = await call(ownerJar, 'PATCH', `/api/tokens/${token.id}`, { label: 'ชื่อใหม่' });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.label, 'ชื่อใหม่');
    assert.deepEqual(renamed.body.grants, { list: ['write_task'], wiki: ['create_page'] });
    assert.deepEqual(ids(renamed.body.projects), [fx.projectId], 'an omitted scope keeps the scope');
    assert.deepEqual(ids(renamed.body.wikis), [wikiId]);

    const emptied = await call(ownerJar, 'PATCH', `/api/tokens/${token.id}`, { label: 'ว่าง', grants: {} });
    assert.equal(emptied.status, 200, JSON.stringify(emptied.body));
    assert.deepEqual(emptied.body.grants, {});
    assert.deepEqual(emptied.body.projects, []);
    assert.deepEqual(emptied.body.wikis, []);
  });

  test('PATCH keeps scope the owner can no longer see', async () => {
    const token = await mint({ grants: { list: [] }, scope: { projectIds: [fx.projectId] } });
    await setMembership(false);
    try {
      const res = await call(ownerJar, 'PATCH', `/api/tokens/${token.id}`, { label: 'มองไม่เห็นแล้ว', scope: { projectIds: [] } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.projects, [], 'a project the viewer cannot see is not named');
    } finally {
      await setMembership(true);
    }
    assert.deepEqual(ids((await listed(token.id)).projects), [fx.projectId]);
  });

  test('removing the list and docs modules clears project scope even when invisible', async () => {
    const token = await mint({ grants: { list: [], docs: [], wiki: [] }, scope: { projectIds: [fx.projectId], wikiIds: [wikiId] } });
    await setMembership(false);
    try {
      const res = await call(ownerJar, 'PATCH', `/api/tokens/${token.id}`, { label: 'วิกิอย่างเดียว', grants: { wiki: [] } });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    } finally {
      await setMembership(true);
    }
    assert.equal(await projectScopeRows(token.id), 0);
    const row = await listed(token.id);
    assert.deepEqual(row.projects, []);
    assert.deepEqual(ids(row.wikis), [wikiId], 'the wiki scope stays with the wiki module');
  });

  test('Allow my token adds wiki read to a list-only token', async () => {
    const token = await mint({ grants: { list: ['create_task'] }, scope: { projectIds: [fx.projectId] } });
    const res = await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/tokens`, { tokenIds: [token.id] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await listed(token.id);
    assert.deepEqual(row.grants.wiki, []);
    assert.deepEqual(row.grants.list, ['create_task']);
    assert.deepEqual(ids(row.wikis), [wikiId]);
    assert.deepEqual(ids(row.projects), [fx.projectId]);
  });

  test('a token cannot reach the session API', async () => {
    const res = await call(ownerJar, 'POST', '/api/tokens', { label: 'bearer', grants: { wiki: [] } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const auth = { authorization: `Bearer ${res.body.secret}` };
    assert.equal((await call(null, 'GET', '/api/tokens', undefined, auth)).status, 401);
    assert.equal((await call(null, 'POST', '/api/tokens', { label: 'ผ่านโทเค็น', grants: {} }, auth)).status, 401);
    assert.equal((await call(null, 'PATCH', `/api/tokens/${res.body.token.id}`, { label: 'x' }, auth)).status, 401);
    assert.equal((await call(null, 'DELETE', `/api/tokens/${res.body.token.id}`, undefined, auth)).status, 401);
  });

  test('20 active tokens is the ceiling', async () => {
    const hoarder = await makeUser(fx.client, 'hoarder');
    const hoarderJar = await signIn(hoarder.email, hoarder.password);
    for (let i = 0; i < 20; i++) {
      const r = await call(hoarderJar, 'POST', '/api/tokens', { label: `t${i}`, grants: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const over = await call(hoarderJar, 'POST', '/api/tokens', { label: 't20', grants: {} });
    assert.equal(over.status, 422);
    assert.match(over.body.message, /20 active tokens/);
    const list = await call(hoarderJar, 'GET', '/api/tokens');
    assert.equal((await call(hoarderJar, 'DELETE', `/api/tokens/${list.body[0].id}`)).status, 200);
    assert.equal((await call(hoarderJar, 'POST', '/api/tokens', { label: 't20', grants: {} })).status, 200);
  });
});
