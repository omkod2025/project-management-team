/**
 * Wikis and their members, through the real API (wiki spec §5a, §5c).
 *
 * Who may do what is decided in `wiki-rules.ts`; these tests defend that the
 * adapter and routes actually ask it, and that a person with no standing on a
 * wiki cannot tell it exists — 404, never 403, for a stranger.
 *
 * The install admin is `admin@cit.com` (PROTECTED_EMAIL). That real account
 * is never modified here. If it does not exist in this database, the test
 * creates a throwaway one and deletes it afterwards; if it exists, its
 * password must be supplied as E2E_INSTALL_ADMIN_PASSWORD or the install-admin
 * cases are skipped.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

const INSTALL_EMAIL = 'admin@cit.com';

let fx: Fixture;
type U = { id: string; email: string; password: string };
let owner: U, writer: U, reader: U, stranger: U, removed: U, doomed: U;
let ownerJar: Jar, writerJar: Jar, readerJar: Jar, strangerJar: Jar, removedJar: Jar, doomedJar: Jar;
let projectAdminJar: Jar;

/** null when the install-admin cases cannot run on this machine. */
let installJar: Jar | null = null;
let installId = '';
/** Set only when this run created the throwaway install account. */
let createdInstallId = '';
let installBranch = '';

/** Every wiki this run creates, deleted in `after` before the users are. */
const wikiIds: string[] = [];

let wikiId = '';

before(async () => {
  fx = await setup();
  owner = await makeUser(fx.client, 'owner');
  writer = await makeUser(fx.client, 'writer');
  reader = await makeUser(fx.client, 'reader');
  stranger = await makeUser(fx.client, 'stranger');
  removed = await makeUser(fx.client, 'removed');
  doomed = await makeUser(fx.client, 'doomed');
  [ownerJar, writerJar, readerJar, strangerJar, removedJar, doomedJar, projectAdminJar] = await Promise.all([
    signIn(owner.email, owner.password),
    signIn(writer.email, writer.password),
    signIn(reader.email, reader.password),
    signIn(stranger.email, stranger.password),
    signIn(removed.email, removed.password),
    signIn(doomed.email, doomed.password),
    signIn(fx.admin.email, fx.admin.password),
  ]);

  const { rows } = await fx.client.query(
    'SELECT user_id FROM pmt_users WHERE lower(user_email) = $1', [INSTALL_EMAIL],
  );
  if (rows.length === 0) {
    const password = randomBytes(18).toString('base64url');
    createdInstallId = randomUUID();
    await fx.client.query(
      `INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash)
       VALUES ($1, $2, 'E2E install', $3)`,
      [createdInstallId, INSTALL_EMAIL, await hashPassword(password)],
    );
    installId = createdInstallId;
    installJar = await signIn(INSTALL_EMAIL, password);
    installBranch = 'created a throwaway admin@cit.com';
  } else if (process.env.E2E_INSTALL_ADMIN_PASSWORD) {
    installId = rows[0].user_id as string;
    installJar = await signIn(INSTALL_EMAIL, process.env.E2E_INSTALL_ADMIN_PASSWORD);
    installBranch = 'signed in to the existing admin@cit.com';
  } else {
    installBranch = 'existing admin@cit.com, no password: install-admin cases skipped';
  }
  console.log(`# install admin: ${installBranch}`);
});

after(async () => {
  if (fx) {
    if (wikiIds.length) await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_id = ANY($1)', [wikiIds]);
    if (createdInstallId) await fx.client.query('DELETE FROM pmt_users WHERE user_id = $1', [createdInstallId]);
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
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function create(jar: Jar, title: string, description = '') {
  const res = await call(jar, 'POST', '/api/wikis', { title, description });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  wikiIds.push(res.body.id);
  return res.body as { id: string; title: string; role: string };
}

const SKIP_INSTALL = 'set E2E_INSTALL_ADMIN_PASSWORD to run install-admin cases';

describe('creating and seeing a wiki', () => {
  test('the owner creates a Thai-titled wiki and sees it in the list', async () => {
    const w = await create(ownerJar, 'คู่มือทีมพัฒนา', 'สิ่งที่ทุกคนควรรู้');
    wikiId = w.id;
    assert.equal(w.title, 'คู่มือทีมพัฒนา');
    assert.equal(w.role, 'owner');

    const list = await call(ownerJar, 'GET', '/api/wikis');
    assert.equal(list.status, 200);
    const mine = (list.body as any[]).find((x) => x.id === wikiId);
    assert.ok(mine, 'owner sees the wiki in the list');
    assert.equal(mine.description, 'สิ่งที่ทุกคนควรรู้');
    assert.equal(mine.ownerId, owner.id);
    assert.equal(mine.archived, false);
    assert.equal(mine.published, false);
  });

  test('a stranger neither lists it nor can read it', async () => {
    const list = await call(strangerJar, 'GET', '/api/wikis');
    assert.equal(list.status, 200);
    assert.ok(!(list.body as any[]).some((x) => x.id === wikiId));
    assert.equal((await call(strangerJar, 'GET', `/api/wikis/${wikiId}`)).status, 404);
    assert.equal((await call(strangerJar, 'GET', `/api/wikis/${wikiId}/members`)).status, 404);
  });

  test('a malformed id is 404, not 500', async () => {
    assert.equal((await call(ownerJar, 'GET', '/api/wikis/not-a-uuid')).status, 404);
  });

  test('a title is required', async () => {
    assert.equal((await call(ownerJar, 'POST', '/api/wikis', { title: '   ' })).status, 422);
  });
});

describe('the role table', () => {
  test('the owner grants write and read members', async () => {
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: writer.id, access: 'write' })).status, 200);
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: reader.id, access: 'read' })).status, 200);
    const members = await call(readerJar, 'GET', `/api/wikis/${wikiId}/members`);
    assert.equal(members.status, 200);
    const byId = new Map((members.body as any[]).map((m) => [m.userId, m.access]));
    assert.equal(byId.get(writer.id), 'write');
    assert.equal(byId.get(reader.id), 'read');
  });

  test('members read the wiki with their own role', async () => {
    const r = await call(readerJar, 'GET', `/api/wikis/${wikiId}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.role, 'read');
    const w = await call(writerJar, 'GET', `/api/wikis/${wikiId}`);
    assert.equal(w.body.role, 'write');
  });

  test('a reader cannot rename or manage members', async () => {
    assert.equal((await call(readerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'rename', title: 'x' })).status, 403);
    assert.equal((await call(readerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: stranger.id, access: 'read' })).status, 403);
  });

  test('a writer cannot manage members', async () => {
    assert.equal((await call(writerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: stranger.id, access: 'read' })).status, 403);
    assert.equal((await call(writerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'rename', title: 'x' })).status, 403);
  });

  test('the owner renames and describes', async () => {
    const r = await call(ownerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'rename', title: 'คู่มือทีม' });
    assert.equal(r.status, 200);
    assert.equal(r.body.title, 'คู่มือทีม');
    const d = await call(ownerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'describe', description: 'ใหม่' });
    assert.equal(d.status, 200);
    assert.equal(d.body.description, 'ใหม่');
  });

  test('a project admin who is not a member gets 404', async () => {
    assert.equal((await call(projectAdminJar, 'GET', `/api/wikis/${wikiId}`)).status, 404);
    assert.equal((await call(projectAdminJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'rename', title: 'x' })).status, 404);
    assert.equal((await call(projectAdminJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: stranger.id, access: 'read' })).status, 404);
  });

  test('the install admin sees, renames and manages members', async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const list = await call(installJar, 'GET', '/api/wikis');
    assert.ok((list.body as any[]).some((x) => x.id === wikiId));
    const r = await call(installJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'rename', title: 'คู่มือทีม (install)' });
    assert.equal(r.status, 200);
    assert.equal(r.body.role, 'install');
    assert.equal((await call(installJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: reader.id, access: 'read' })).status, 200);
  });

  test('granting to an unknown or inactive user is 404; to the owner is 422', async () => {
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: randomUUID(), access: 'read' })).status, 404);
    await fx.client.query('UPDATE pmt_users SET user_is_active = false WHERE user_id = $1', [doomed.id]);
    try {
      assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: doomed.id, access: 'read' })).status, 404);
    } finally {
      await fx.client.query('UPDATE pmt_users SET user_is_active = true WHERE user_id = $1', [doomed.id]);
    }
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: owner.id, access: 'write' })).status, 422);
  });

  test('archiving hides the wiki from members but not from the owner', async () => {
    const a = await call(ownerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'archive' });
    assert.equal(a.status, 200);
    assert.equal(a.body.archived, true);
    assert.equal((await call(writerJar, 'GET', `/api/wikis/${wikiId}`)).status, 404);
    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${wikiId}`)).status, 200);
    const r = await call(ownerJar, 'PATCH', `/api/wikis/${wikiId}`, { action: 'restore' });
    assert.equal(r.status, 200);
    assert.equal(r.body.archived, false);
    assert.equal((await call(writerJar, 'GET', `/api/wikis/${wikiId}`)).status, 200);
  });
});

describe('removing a member', () => {
  test('removed member gets 404 on next read', async () => {
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${wikiId}/members`, { userId: removed.id, access: 'write' })).status, 200);
    assert.equal((await call(removedJar, 'GET', `/api/wikis/${wikiId}`)).status, 200);
    assert.equal((await call(ownerJar, 'DELETE', `/api/wikis/${wikiId}/members`, { userId: removed.id })).status, 200);
    assert.equal((await call(removedJar, 'GET', `/api/wikis/${wikiId}`)).status, 404);
    const list = await call(removedJar, 'GET', '/api/wikis');
    assert.ok(!(list.body as any[]).some((x) => x.id === wikiId));
  });
});

describe('transferring ownership', () => {
  test('the previous owner becomes write and the new owner can manage', async () => {
    const w = await create(ownerJar, 'โอนสิทธิ์');
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${w.id}/members`, { userId: writer.id, access: 'write' })).status, 200);

    const t = await call(ownerJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'transfer', userId: writer.id });
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.equal(t.body.ownerId, writer.id);

    const members = await call(writerJar, 'GET', `/api/wikis/${w.id}/members`);
    const byId = new Map((members.body as any[]).map((m) => [m.userId, m.access]));
    assert.equal(byId.get(owner.id), 'write');
    assert.equal(byId.has(writer.id), false, 'the new owner has no member row');

    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${w.id}`)).body.role, 'write');
    assert.equal((await call(writerJar, 'GET', `/api/wikis/${w.id}`)).body.role, 'owner');
    assert.equal((await call(writerJar, 'PUT', `/api/wikis/${w.id}/members`, { userId: reader.id, access: 'read' })).status, 200);
    assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${w.id}/members`, { userId: stranger.id, access: 'read' })).status, 403);
  });
});

describe('archived wikis', () => {
  test('transferring an archived wiki succeeds and persists', async () => {
    const w = await create(ownerJar, 'เก็บแล้วโอน');
    assert.equal((await call(ownerJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'archive' })).status, 200);
    const t = await call(ownerJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'transfer', userId: writer.id });
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.equal(t.body.ownerId, writer.id);
    assert.equal(t.body.role, 'write');
    assert.equal(t.body.archived, true);
    const { rows } = await fx.client.query(
      `SELECT w.wiki_owner_id, m.wiki_member_access
         FROM pmt_wikis w
         LEFT JOIN pmt_wiki_members m ON m.wiki_member_wiki_id = w.wiki_id AND m.wiki_member_user_id = $2
        WHERE w.wiki_id = $1`,
      [w.id, owner.id],
    );
    assert.equal(rows[0]?.wiki_owner_id, writer.id);
    assert.equal(rows[0]?.wiki_member_access, 'write');
    // The previous owner, now a write member, no longer sees the archived wiki.
    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${w.id}`)).status, 404);
  });

  test('archiving withdraws the public link and restoring does not bring it back', async () => {
    const w = await create(ownerJar, 'ลิงก์สาธารณะ');
    // The publish API arrives in a later task; set the secret directly.
    await fx.client.query('UPDATE pmt_wikis SET wiki_public_token = $1 WHERE wiki_id = $2',
      [randomBytes(32).toString('base64url'), w.id]);
    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${w.id}`)).body.published, true);

    const a = await call(ownerJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'archive' });
    assert.equal(a.status, 200);
    assert.equal(a.body.published, false);
    const { rows } = await fx.client.query('SELECT wiki_public_token FROM pmt_wikis WHERE wiki_id = $1', [w.id]);
    assert.equal(rows[0]?.wiki_public_token, null);

    const r = await call(ownerJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'restore' });
    assert.equal(r.status, 200);
    assert.equal(r.body.published, false);
  });
});

describe('account deletion', () => {
  test('deleting the owner hands the wiki to the install admin', async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const w = await create(doomedJar, 'ของคนที่กำลังจะไป');
    const del = await call(installJar, 'DELETE', `/api/users/${doomed.id}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    const { rows } = await fx.client.query('SELECT wiki_owner_id FROM pmt_wikis WHERE wiki_id = $1', [w.id]);
    assert.equal(rows[0]?.wiki_owner_id, installId);
    const got = await call(installJar, 'GET', `/api/wikis/${w.id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.ownerId, installId);
  });
});

describe('the boundary', () => {
  test('a bearer token without a session cookie is 401', async () => {
    const res = await call(null, 'GET', '/api/wikis', undefined, {
      authorization: `Bearer pmw_${randomBytes(32).toString('base64url')}`,
    });
    assert.equal(res.status, 401);
  });

  test('an injection-shaped title is stored and read back identically', async () => {
    const title = "'); DROP TABLE pmt_wikis; --";
    const w = await create(ownerJar, title);
    assert.equal(w.title, title);
    const got = await call(ownerJar, 'GET', `/api/wikis/${w.id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.title, title);
    const { rows } = await fx.client.query('SELECT wiki_title FROM pmt_wikis WHERE wiki_id = $1', [w.id]);
    assert.equal(rows[0]?.wiki_title, title);
  });
});
