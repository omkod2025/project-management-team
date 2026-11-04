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

/* ------------------------------------------------------- pages (Task 5) */

type Page = { id: string; wikiId: string; parentId: string | null; depth: number; title: string; slug: string; body: string; updatedAt: string };

async function wikiWithMembers(title: string) {
  const w = await create(ownerJar, title);
  assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${w.id}/members`, { userId: writer.id, access: 'write' })).status, 200);
  assert.equal((await call(ownerJar, 'PUT', `/api/wikis/${w.id}/members`, { userId: reader.id, access: 'read' })).status, 200);
  return w.id;
}

async function newPage(jar: Jar, wiki: string, input: Record<string, unknown>): Promise<Page> {
  const res = await call(jar, 'POST', `/api/wikis/${wiki}/pages`, input);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as Page;
}

async function tree(jar: Jar, wiki: string) {
  const res = await call(jar, 'GET', `/api/wikis/${wiki}/pages`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as { wiki: { id: string }; pages: Page[]; archivedPages: Page[] };
}

async function save(jar: Jar, page: Pick<Page, 'id' | 'updatedAt'>, body: string, extra: Record<string, unknown> = {}) {
  return call(jar, 'PATCH', `/api/wiki-pages/${page.id}`, { content: { body }, updatedAt: page.updatedAt, ...extra });
}

describe('wiki pages', () => {
  let pw = '';
  let p1: Page, p2: Page, p3: Page;

  before(async () => { pw = await wikiWithMembers('หน้าในวิกิ'); });

  test('a writer nests pages to depth three, and a fourth level is 422', async () => {
    p1 = await newPage(writerJar, pw, { title: 'ระดับหนึ่ง' });
    assert.equal(p1.depth, 1);
    assert.match(p1.slug, /^page-[0-9a-f]{8}$/);
    p2 = await newPage(writerJar, pw, { title: 'ระดับสอง', parentId: p1.id, slug: 'level-two' });
    assert.equal(p2.depth, 2);
    assert.equal(p2.slug, 'level-two');
    p3 = await newPage(writerJar, pw, { title: 'ระดับสาม', parentId: p2.id });
    assert.equal(p3.depth, 3);
    const deep = await call(writerJar, 'POST', `/api/wikis/${pw}/pages`, { title: 'สี่', parentId: p3.id });
    assert.equal(deep.status, 422);
    assert.equal(deep.body.code, 'E_MAX_DEPTH');
    const t = await tree(readerJar, pw);
    assert.deepEqual(t.pages.map((p) => p.id), [p1.id, p2.id, p3.id]);
    assert.deepEqual(t.archivedPages, [], 'a reader is not shown archived pages');
  });

  test('a duplicate slug is refused', async () => {
    const dup = await call(writerJar, 'POST', `/api/wikis/${pw}/pages`, { title: 'ซ้ำ', slug: 'level-two' });
    assert.equal(dup.status, 422);
  });

  test('a reader cannot create or save; a stranger cannot tell the wiki exists', async () => {
    assert.equal((await call(readerJar, 'POST', `/api/wikis/${pw}/pages`, { title: 'x' })).status, 403);
    assert.equal((await save(readerJar, p1, 'x')).status, 403);
    assert.equal((await call(strangerJar, 'GET', `/api/wikis/${pw}/pages`)).status, 404);
    assert.equal((await call(strangerJar, 'POST', `/api/wikis/${pw}/pages`, { title: 'x' })).status, 404);
    assert.equal((await save(strangerJar, p1, 'x')).status, 404);
    assert.equal((await call(strangerJar, 'GET', `/api/wiki-pages/${p1.id}/history`)).status, 404);
    assert.equal((await call(strangerJar, 'POST', `/api/wiki-pages/${p1.id}`, { action: 'archive' })).status, 404);
    assert.equal((await call(writerJar, 'GET', '/api/wiki-pages/not-a-uuid/history')).status, 404);
  });

  test('a save returns the PageEditor shape, and a stale save is 409 naming the editor', async () => {
    const ok = await save(writerJar, p1, 'เนื้อหาใหม่', { title: 'ระดับหนึ่ง (แก้)' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.title, 'ระดับหนึ่ง (แก้)');
    assert.equal(typeof ok.body.updatedAt, 'string');
    assert.equal(ok.body.assetCleanupPending, 0);
    const stale = await save(ownerJar, p1, 'ทับ');
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'E_DOC_CONFLICT');
    assert.ok(String(stale.body.message).includes('writer'), stale.body.message);
    p1 = { ...p1, updatedAt: ok.body.updatedAt };
    const { rows } = await fx.client.query('SELECT wiki_page_search_text FROM pmt_wiki_pages WHERE wiki_page_id = $1', [p1.id]);
    assert.ok(String(rows[0]?.wiki_page_search_text).includes('เนื้อหาใหม่'));
  });

  test('a save leaves a history entry in the PageEditor shape', async () => {
    const h = await call(readerJar, 'GET', `/api/wiki-pages/${p1.id}/history`);
    assert.equal(h.status, 200);
    assert.ok(h.body.length >= 1);
    assert.equal(h.body[0].content.body, 'เนื้อหาใหม่');
    assert.equal(typeof h.body[0].editor, 'string');
    assert.equal(typeof h.body[0].updatedAt, 'string');
  });

  test('moving a parent under its own child is 422; a legal move re-depths the subtree', async () => {
    const loop = await call(writerJar, 'POST', `/api/wiki-pages/${p1.id}`, { action: 'move', parentId: p3.id });
    assert.equal(loop.status, 422);
    const other = await newPage(writerJar, pw, { title: 'อีกต้น' });
    const tooDeep = await call(writerJar, 'POST', `/api/wiki-pages/${p1.id}`, { action: 'move', parentId: other.id });
    assert.equal(tooDeep.status, 422);
    assert.equal(tooDeep.body.code, 'E_MAX_DEPTH');
    const up = await call(writerJar, 'POST', `/api/wiki-pages/${p2.id}`, { action: 'move', parentId: null, beforeId: p1.id });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.depth, 1);
    const t = await tree(writerJar, pw);
    assert.equal(t.pages.find((p) => p.id === p3.id)?.depth, 2);
    assert.ok(t.pages.findIndex((p) => p.id === p2.id) < t.pages.findIndex((p) => p.id === p1.id), 'beforeId orders siblings');
  });

  test('archiving takes the subtree; restoring brings it back with its slug', async () => {
    assert.equal((await call(readerJar, 'POST', `/api/wiki-pages/${p2.id}`, { action: 'archive' })).status, 403);
    const a = await call(writerJar, 'POST', `/api/wiki-pages/${p2.id}`, { action: 'archive' });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    let t = await tree(writerJar, pw);
    assert.ok(!t.pages.some((p) => p.id === p2.id || p.id === p3.id));
    assert.deepEqual(t.archivedPages.map((p) => p.id).sort(), [p2.id, p3.id].sort());
    assert.equal((await call(readerJar, 'PATCH', `/api/wikis/${pw}/pages`, { pageId: p2.id })).status, 403);
    const r = await call(writerJar, 'PATCH', `/api/wikis/${pw}/pages`, { pageId: p2.id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.slug, 'level-two');
    t = await tree(writerJar, pw);
    assert.ok(t.pages.some((p) => p.id === p2.id && p.slug === 'level-two'));
    assert.ok(t.pages.some((p) => p.id === p3.id));
  });

  test('an injection-laden body round-trips byte for byte', async () => {
    const body = "ปลั๊ก ' \" ; -- $$ \\ '); DROP TABLE pmt_wikis; --\n\n```mermaid\ngraph TD\n  A[\"'); DROP TABLE pmt_wikis; --\"] --> B{$$ \\ ปลั๊ก}\n```\n";
    const title = "'); DROP TABLE pmt_wikis; -- ปลั๊ก";
    const page = await newPage(writerJar, pw, { title, body });
    assert.equal(page.body, body);
    assert.equal(page.title, title);
    const res = await save(writerJar, page, body + '\n$$');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const t = await tree(readerJar, pw);
    assert.equal(t.pages.find((p) => p.id === page.id)?.body, body + '\n$$');
    const { rows } = await fx.client.query('SELECT wiki_page_body FROM pmt_wiki_pages WHERE wiki_page_id = $1', [page.id]);
    assert.equal(rows[0]?.wiki_page_body, body + '\n$$');
    const { rows: still } = await fx.client.query("SELECT to_regclass('pmt_wikis') AS t");
    assert.ok(still[0]?.t);
  });
});

describe('wiki assets', () => {
  let wa = '', wb = '';
  let assetUrl = '';

  before(async () => {
    wa = await wikiWithMembers('ไฟล์ในวิกิ A');
    wb = (await create(ownerJar, 'วิกิ B')).id;
  });

  async function upload(jar: Jar, wiki: string, kind?: string) {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new File([png], 'รูป.png', { type: 'image/png' }));
    if (kind) form.append('kind', kind);
    const res = await fetch(`${BASE_URL}/api/wikis/${wiki}/assets`, { method: 'POST', headers: { cookie: jar.header }, body: form });
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  }

  test('a writer uploads; a reader fetches it; a stranger gets 404', async () => {
    assert.equal((await upload(readerJar, wa)).status, 403);
    assert.equal((await upload(strangerJar, wa)).status, 404);
    const up = await upload(writerJar, wa);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.match(up.body.url, /^\/api\/wiki-assets\/[0-9a-f-]{36}$/);
    assetUrl = up.body.url;
    const got = await fetch(`${BASE_URL}${assetUrl}`, { headers: { cookie: readerJar.header } });
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.ok(got.headers.get('content-security-policy')?.includes('sandbox'));
    const no = await fetch(`${BASE_URL}${assetUrl}`, { headers: { cookie: strangerJar.header } });
    assert.equal(no.status, 404);
    const bad = await fetch(`${BASE_URL}/api/wiki-assets/not-a-uuid`, { headers: { cookie: readerJar.header } });
    assert.equal(bad.status, 404);
  });

  test('an attachment is always served as a download', async () => {
    const up = await upload(writerJar, wa, 'attachment');
    assert.equal(up.status, 200, JSON.stringify(up.body));
    const got = await fetch(`${BASE_URL}${up.body.url}`, { headers: { cookie: readerJar.header } });
    assert.equal(got.status, 200);
    assert.match(got.headers.get('content-disposition') ?? '', /^attachment/);
  });

  test('a page in wiki B cannot link an asset of wiki A; a page in wiki A can', async () => {
    const inB = await newPage(ownerJar, wb, { title: 'ใน B' });
    const res = await save(ownerJar, inB, `![x](${assetUrl})`);
    assert.equal(res.status, 422);
    const created = await call(ownerJar, 'POST', `/api/wikis/${wb}/pages`, { title: 'ใน B 2', body: `![x](${assetUrl})` });
    assert.equal(created.status, 422);
    const inA = await newPage(writerJar, wa, { title: 'ใน A' });
    const ok = await save(writerJar, inA, `![x](${assetUrl})`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('removing a file and pressing Done deletes it; autosave alone keeps it', async () => {
    const up = await upload(writerJar, wa);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    const id = String(up.body.url).split('/').pop()!;
    const page = await newPage(writerJar, wa, { title: 'ลบไฟล์', body: `![x](${up.body.url})` });
    const autosave = await save(writerJar, page, 'ไม่มีรูปแล้ว');
    assert.equal(autosave.status, 200, JSON.stringify(autosave.body));
    assert.equal((await fetch(`${BASE_URL}${up.body.url}`, { headers: { cookie: readerJar.header } })).status, 200, 'autosave keeps the file');
    const done = await save(writerJar, { id: page.id, updatedAt: autosave.body.updatedAt }, 'ไม่มีรูปแล้ว', { finalizeAssets: true });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.assetCleanupPending, 0);
    assert.equal((await fetch(`${BASE_URL}${up.body.url}`, { headers: { cookie: readerJar.header } })).status, 404);
    const { rows } = await fx.client.query(
      `SELECT (SELECT count(*) FROM pmt_wiki_assets WHERE wiki_asset_id = $1)::int AS assets,
              (SELECT count(*) FROM pmt_wiki_asset_deletions WHERE wiki_asset_deletion_id = $1)::int AS queued`, [id]);
    assert.deepEqual(rows[0], { assets: 0, queued: 0 });
  });
});
