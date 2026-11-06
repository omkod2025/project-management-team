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
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

const INSTALL_EMAIL = 'admin@cit.com';

let fx: Fixture;
type U = { id: string; email: string; password: string };
/** A row of an API listing — the tests read whichever field they assert on. */
type Row = { id: string; wikis: { id: string }[]; [field: string]: unknown };
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
  return { status: res.status, body: await res.json().catch(() => null) };
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
    const mine = (list.body as Row[]).find((x) => x.id === wikiId);
    assert.ok(mine, 'owner sees the wiki in the list');
    assert.equal(mine.description, 'สิ่งที่ทุกคนควรรู้');
    assert.equal(mine.ownerId, owner.id);
    assert.equal(mine.archived, false);
    assert.equal(mine.published, false);
  });

  test('a stranger neither lists it nor can read it', async () => {
    const list = await call(strangerJar, 'GET', '/api/wikis');
    assert.equal(list.status, 200);
    assert.ok(!(list.body as Row[]).some((x) => x.id === wikiId));
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
    const byId = new Map((members.body as Row[]).map((m) => [m.userId, m.access]));
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
    assert.ok((list.body as Row[]).some((x) => x.id === wikiId));
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
    assert.ok(!(list.body as Row[]).some((x) => x.id === wikiId));
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
    const byId = new Map((members.body as Row[]).map((m) => [m.userId, m.access]));
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
  test('a live access token opens /api/mcp and nothing else: every wiki REST route is 401 without a session', async () => {
    const w = await create(ownerJar, 'ขอบเขตของโทเค็น');
    const page = await newPage(ownerJar, w.id, { title: 'หน้าในขอบเขต' });
    const minted = await call(ownerJar, 'POST', '/api/wiki-tokens', { label: 'boundary', wikiIds: [w.id] });
    assert.equal(minted.status, 200, JSON.stringify(minted.body));
    const auth = { authorization: `Bearer ${minted.body.secret}` };

    // The token is genuinely valid: the one route it is for accepts it.
    const mcp = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...auth },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } },
      }),
    });
    assert.equal(mcp.status, 200, await mcp.text());

    const routes: Array<[string, string, unknown?]> = [
      ['GET', '/api/wikis'],
      ['POST', '/api/wikis', { title: 'ผ่านโทเค็น' }],
      ['GET', '/api/wikis/search?q=x'],
      ['GET', `/api/wikis/${w.id}`],
      ['PATCH', `/api/wikis/${w.id}`, { title: 'ผ่านโทเค็น' }],
      ['GET', `/api/wikis/${w.id}/pages`],
      ['POST', `/api/wikis/${w.id}/pages`, { title: 'ผ่านโทเค็น' }],
      ['GET', `/api/wikis/${w.id}/members`],
      ['PATCH', `/api/wiki-pages/${page.id}`, { title: 'ผ่านโทเค็น', updatedAt: page.updatedAt }],
      ['GET', `/api/wiki-pages/${page.id}/history`],
      ['GET', '/api/wiki-tokens'],
      ['POST', '/api/wiki-tokens', { label: 'ผ่านโทเค็น', wikiIds: [] }],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(null, method, path, body, auth);
      assert.equal(res.status, 401, `${method} ${path} answered ${res.status} to a Bearer token`);
    }
    // And none of the writes landed.
    const { rows } = await fx.client.query(
      "SELECT (SELECT count(*)::int FROM pmt_wikis WHERE wiki_title = 'ผ่านโทเค็น') +"
      + " (SELECT count(*)::int FROM pmt_wiki_pages WHERE wiki_page_title = 'ผ่านโทเค็น') +"
      + " (SELECT count(*)::int FROM pmt_wiki_tokens WHERE wiki_token_label = 'ผ่านโทเค็น') AS n",
    );
    assert.equal(rows[0].n, 0);
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

  test("a stranger's refusal for a real page id is identical to an unknown id's", async () => {
    const missing = randomUUID();
    const probes: Array<[string, string, unknown?]> = [
      ['GET', '/history'],
      ['PATCH', '', { content: { body: 'x' }, updatedAt: p1.updatedAt }],
      ['POST', '', { action: 'archive' }],
      ['POST', '', { action: 'move', parentId: null }],
    ];
    for (const [method, suffix, body] of probes) {
      const real = await call(strangerJar, method, `/api/wiki-pages/${p1.id}${suffix}`, body);
      const fake = await call(strangerJar, method, `/api/wiki-pages/${missing}${suffix}`, body);
      assert.equal(real.status, 404, `${method} ${suffix}`);
      assert.deepEqual(real, fake, `${method} ${suffix} must not reveal that the page exists`);
    }
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
    // No beforeId is "last", for a page that keeps its parent too (the tree's Move to… → Last).
    const last = await call(writerJar, 'POST', `/api/wiki-pages/${p2.id}`, { action: 'move', parentId: null });
    assert.equal(last.status, 200, JSON.stringify(last.body));
    const top = (await tree(writerJar, pw)).pages.filter((p) => p.parentId === null);
    assert.equal(top[top.length - 1]?.id, p2.id);
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

/* -------------------------------------------------------- search (Task 6) */

describe('search', () => {
  let sw = '';
  let plugIron: Page, plugOnly: Page, percentPage: Page, underscorePage: Page;

  before(async () => {
    sw = await wikiWithMembers('ค้นหา');
    plugIron = await newPage(writerJar, sw, { title: 'ปลั๊กไฟ', body: 'เปลี่ยนปลั๊กไฟที่ห้องประชุม' });
    plugOnly = await newPage(writerJar, sw, { title: 'ปลั๊กเสีย', body: 'ปลั๊กเสียแล้วต้องเปลี่ยน' });
    percentPage = await newPage(writerJar, sw, { title: 'ส่วนลด', body: 'ลดราคา 50% วันนี้เท่านั้น' });
    underscorePage = await newPage(writerJar, sw, { title: 'ชื่อตัวแปร', body: 'ตัวแปรชื่อ user_id ต้องไม่ว่าง' });
  });

  async function search(jar: Jar, q: string, wiki?: string) {
    const params = new URLSearchParams({ q });
    if (wiki) params.set('wiki', wiki);
    return call(jar, 'GET', `/api/wikis/search?${params.toString()}`);
  }

  test('a term finds a page whose body contains it', async () => {
    const res = await search(readerJar, 'ปลั๊ก', sw);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = (res.body as Row[]).map((r) => r.pageId);
    assert.ok(ids.includes(plugIron.id), 'finds เปลี่ยนปลั๊กไฟ');
    assert.ok(ids.includes(plugOnly.id));
  });

  test('two terms are combined with AND', async () => {
    const res = await search(readerJar, 'ปลั๊ก ไฟ', sw);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = (res.body as Row[]).map((r) => r.pageId);
    assert.ok(ids.includes(plugIron.id));
    assert.ok(!ids.includes(plugOnly.id), 'ปลั๊กเสีย has no ไฟ');
  });

  test('a literal % or _ matches only the page that contains it literally', async () => {
    const pct = await search(readerJar, '%', sw);
    assert.equal(pct.status, 200, JSON.stringify(pct.body));
    assert.deepEqual((pct.body as Row[]).map((r) => r.pageId), [percentPage.id]);

    const us = await search(readerJar, '_', sw);
    assert.equal(us.status, 200, JSON.stringify(us.body));
    assert.deepEqual((us.body as Row[]).map((r) => r.pageId), [underscorePage.id]);
  });

  test('an injection attempt is just a query with no matches, and the table survives', async () => {
    const res = await search(ownerJar, "'); DROP TABLE pmt_wikis; --", sw);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, []);
    const { rows } = await fx.client.query("SELECT to_regclass('pmt_wikis') AS t");
    assert.ok(rows[0]?.t, 'pmt_wikis still exists');
  });

  test("a stranger's search never returns a page from a wiki they cannot see", async () => {
    const res = await search(strangerJar, 'ปลั๊ก');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = (res.body as Row[]).map((r) => r.pageId);
    assert.ok(!ids.includes(plugIron.id));
    assert.ok(!ids.includes(plugOnly.id));
  });

  test('?wiki=<a wiki the caller cannot see> is 404', async () => {
    const res = await search(strangerJar, 'ปลั๊ก', sw);
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });

  test('?wiki=<unknown id> is also 404', async () => {
    const res = await search(ownerJar, 'ปลั๊ก', randomUUID());
    assert.equal(res.status, 404, JSON.stringify(res.body));
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
    return { status: res.status, body: await res.json().catch(() => null) };
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

  test("a stranger's refusal for a real asset id is identical to an unknown id's", async () => {
    const get = async (url: string) => {
      const res = await fetch(`${BASE_URL}${url}`, { headers: { cookie: strangerJar.header } });
      return { status: res.status, body: await res.text() };
    };
    const real = await get(assetUrl);
    const fake = await get(`/api/wiki-assets/${randomUUID()}`);
    assert.equal(real.status, 404);
    assert.deepEqual(real, fake);
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

/* -------------------------------------------------- public link (Task 8) */

describe('the public link', () => {
  let pub = '';
  let token = '';
  let referencedAsset = '', strayAsset = '';

  async function uploadPng(jar: Jar, wiki: string) {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new File([png], 'สาธารณะ.png', { type: 'image/png' }));
    const res = await fetch(`${BASE_URL}/api/wikis/${wiki}/assets`, { method: 'POST', headers: { cookie: jar.header }, body: form });
    assert.equal(res.status, 200);
    return String(((await res.json()) as { url: string }).url).split('/').pop()!;
  }

  /** A stranger with no session at all. */
  const anon = (path: string) => fetch(`${BASE_URL}${path}`, { redirect: 'manual' });

  before(async () => {
    pub = await wikiWithMembers('วิกิสาธารณะ');
    referencedAsset = await uploadPng(writerJar, pub);
    strayAsset = await uploadPng(writerJar, pub);
    await newPage(writerJar, pub, { title: 'หน้าแรกสาธารณะ', slug: 'start' });
    await newPage(writerJar, pub, {
      title: 'หน้าที่สอง',
      slug: 'second',
      body: `![รูป](/api/wiki-assets/${referencedAsset})\n\n[กลับหน้าแรก](/wiki/${pub}/start) [ตั้งค่า](/wiki/${pub}/settings) [โครงการ](/p/x/list)`,
    });
    const hidden = await newPage(writerJar, pub, { title: 'หน้าที่เก็บแล้ว', slug: 'gone' });
    assert.equal((await call(writerJar, 'POST', `/api/wiki-pages/${hidden.id}`, { action: 'archive' })).status, 200);
  });

  test('a reader or writer cannot publish; a stranger cannot tell the wiki exists', async () => {
    assert.equal((await call(readerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' })).status, 403);
    assert.equal((await call(writerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' })).status, 403);
    assert.equal((await call(strangerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' })).status, 404);
  });

  test('the owner publishes and gets the token; publishing again returns the same one', async () => {
    const res = await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.published, true);
    assert.match(res.body.publicToken, /^[A-Za-z0-9_-]{43}$/);
    token = res.body.publicToken;
    const again = await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' });
    assert.equal(again.body.publicToken, token);
  });

  test('the token is shown to the manager only', async () => {
    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${pub}`)).body.publicToken, token);
    const asReader = await call(readerJar, 'GET', `/api/wikis/${pub}`);
    assert.equal(asReader.body.published, true);
    assert.equal(asReader.body.publicToken, undefined);
    const listed = (await call(writerJar, 'GET', '/api/wikis')).body as Array<Record<string, unknown>>;
    assert.equal(listed.find((w) => w.id === pub)?.publicToken, undefined);
  });

  test('an unauthenticated reader sees the page: noindex, no-store, tree, no owner, no links back in', async () => {
    const res = await anon(`/w/${token}/second`);
    assert.equal(res.status, 200);
    /* A force-dynamic page is sent `private, no-cache, no-store, max-age=0,
       must-revalidate` in production. `next dev` overwrites every page's
       Cache-Control with exactly `no-cache, must-revalidate` (base-server.js),
       so against a dev server that is the one other answer accepted — any
       public or s-maxage caching fails either way. */
    const cache = res.headers.get('cache-control') ?? '';
    assert.ok(/(^|[ ,])no-store/.test(cache) || cache === 'no-cache, must-revalidate', cache);
    assert.ok(!/public|s-maxage/.test(cache), cache);
    const html = await res.text();
    assert.ok(
      /noindex/.test(res.headers.get('x-robots-tag') ?? '') || /<meta name="robots" content="noindex, nofollow"/.test(html),
      'noindex, nofollow',
    );
    assert.ok(html.includes('วิกิสาธารณะ'), 'wiki title');
    assert.ok(html.includes('หน้าที่สอง'), 'page title');
    assert.ok(html.includes('หน้าแรกสาธารณะ'), 'the tree names the other page');
    // On a phone the tree folds into a closed <details> naming this page, so the page comes first.
    assert.match(html, /<details><summary>(?:(?!<\/summary>).)*หน้าที่สอง(?:(?!<\/summary>).)*<\/summary>/s, 'the folded tree names the current page');
    assert.ok(!html.includes('หน้าที่เก็บแล้ว'), 'an archived page is not in the tree');
    assert.ok(html.includes(`href="/w/${token}/start"`), 'a link to a page of this wiki stays inside the link');
    assert.ok(html.includes(`/w/${token}/assets/${referencedAsset}`), 'the image goes through the token');
    assert.ok(!html.includes(`/wiki/${pub}`), 'no address back into the app, not even in the RSC payload');
    assert.ok(!html.includes('/p/x/list'), 'no project address');
    assert.ok(!html.includes('/api/wiki-assets/'), 'the authenticated asset route is never handed out');
    assert.ok(!html.includes(owner.email), 'no owner');
  });

  test('the bare link opens the first page', async () => {
    const res = await anon(`/w/${token}`);
    assert.ok([302, 303, 307, 308].includes(res.status), String(res.status));
    assert.match(res.headers.get('location') ?? '', new RegExp(`/w/${token}/start$`));
  });

  test('an archived page and an unknown slug are the same 404', async () => {
    assert.equal((await anon(`/w/${token}/gone`)).status, 404);
    assert.equal((await anon(`/w/${token}/no-such-page`)).status, 404);
  });

  test('a referenced asset is served with the asset headers; an unreferenced one is 404', async () => {
    const got = await anon(`/w/${token}/assets/${referencedAsset}`);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.match(got.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(got.headers.get('content-security-policy')?.includes('sandbox'));
    assert.equal((await anon(`/w/${token}/assets/${strayAsset}`)).status, 404);
    assert.equal((await anon(`/w/${token}/assets/${randomUUID()}`)).status, 404);
    assert.equal((await anon(`/w/${token}/assets/not-a-uuid`)).status, 404);
  });

  test('a malformed or unknown token is 404', async () => {
    assert.equal((await anon('/w/short/start')).status, 404);
    assert.equal((await anon(`/w/${randomBytes(32).toString('base64url')}/start`)).status, 404);
  });

  test('a reader cannot unpublish; the owner can, and the old token is dead', async () => {
    assert.equal((await call(readerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'unpublish' })).status, 403);
    const res = await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'unpublish' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.published, false);
    assert.equal(res.body.publicToken, null);
    assert.equal((await anon(`/w/${token}/second`)).status, 404);
    assert.equal((await anon(`/w/${token}/assets/${referencedAsset}`)).status, 404);
  });

  test('publishing again mints a different token', async () => {
    const res = await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.publicToken, token);
    token = res.body.publicToken;
    assert.equal((await anon(`/w/${token}/start`)).status, 200);
  });

  test('archiving the wiki withdraws the link', async () => {
    assert.equal((await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'archive' })).status, 200);
    assert.equal((await anon(`/w/${token}/start`)).status, 404);
    assert.equal((await anon(`/w/${token}`)).status, 404);
  });

  test('an archived wiki cannot be published until it is restored', async () => {
    const res = await call(ownerJar, 'PATCH', `/api/wikis/${pub}`, { action: 'publish' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.published, undefined);
  });

  test('the install admin can publish and unpublish; an empty wiki shows its empty state', async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const w = await create(ownerJar, 'วิกิของผู้ดูแล');
    const res = await call(installJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'publish' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.publicToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await anon(`/w/${res.body.publicToken}`)).status, 200);
    assert.equal((await call(installJar, 'PATCH', `/api/wikis/${w.id}`, { action: 'unpublish' })).status, 200);
  });
});

/* ------------------------------------------------------ tokens (Task 9) */

describe('access tokens', () => {
  let tw = '';       // owner's wiki; writer has write, reader has read
  let hidden = '';   // a wiki the writer cannot see
  let writerToken = '';
  let writerSecret = '';
  let ownerToken = '';
  let hoarder: U, hoarderJar: Jar;

  const SECRET_RE = /^pmw_[A-Za-z0-9_-]{43}$/;

  before(async () => {
    tw = await wikiWithMembers('วิกิกับโทเค็น');
    hidden = (await create(ownerJar, 'วิกิที่มองไม่เห็น')).id;
    hoarder = await makeUser(fx.client, 'hoarder');
    hoarderJar = await signIn(hoarder.email, hoarder.password);
  });

  test('creating returns the secret once; a later GET never carries it or the hash', async () => {
    const res = await call(writerJar, 'POST', '/api/wiki-tokens', { label: 'แล็ปท็อปของฉัน', wikiIds: [tw] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.secret, SECRET_RE);
    writerSecret = res.body.secret;
    writerToken = res.body.token.id;
    assert.equal(res.body.token.label, 'แล็ปท็อปของฉัน');
    assert.equal(res.body.token.prefix, writerSecret.slice(4, 12));
    assert.equal(res.body.token.status, 'active');
    assert.deepEqual(res.body.token.wikis.map((w: { id: string }) => w.id), [tw]);
    assert.equal(res.body.token.hash, undefined);

    const list = await call(writerJar, 'GET', '/api/wiki-tokens');
    assert.equal(list.status, 200);
    const raw = JSON.stringify(list.body);
    const { rows } = await fx.client.query('SELECT wiki_token_hash FROM pmt_wiki_tokens WHERE wiki_token_id = $1', [writerToken]);
    assert.ok(!raw.includes(writerSecret), 'the list never carries the secret');
    assert.ok(!raw.includes(rows[0].wiki_token_hash), 'the list never carries the hash');
    assert.ok(!raw.includes('"secret"'));
    const mine = (list.body as Row[]).find((t) => t.id === writerToken);
    assert.ok(mine);
    assert.equal(mine.ownerId, writer.id);
  });

  test('the database stores sha256(secret) and the prefix, never the secret', async () => {
    const { rows } = await fx.client.query(
      'SELECT wiki_token_hash, wiki_token_prefix FROM pmt_wiki_tokens WHERE wiki_token_id = $1', [writerToken],
    );
    assert.equal(rows[0].wiki_token_hash, createHash('sha256').update(writerSecret).digest('hex'));
    assert.equal(rows[0].wiki_token_prefix, writerSecret.slice(4, 12));
    const hit = await fx.client.query(
      'SELECT 1 FROM pmt_wiki_tokens WHERE wiki_token_hash = $1 OR wiki_token_prefix = $1 OR wiki_token_label = $1', [writerSecret],
    );
    assert.equal(hit.rowCount, 0);
  });

  test('scoping to a wiki the caller cannot see is 404, as is a malformed id', async () => {
    assert.equal((await call(writerJar, 'POST', '/api/wiki-tokens', { label: 'x', wikiIds: [hidden] })).status, 404);
    assert.equal((await call(writerJar, 'POST', '/api/wiki-tokens', { label: 'x', wikiIds: ['nope'] })).status, 404);
    assert.equal((await call(writerJar, 'PATCH', `/api/wiki-tokens/${writerToken}`, { label: 'x', wikiIds: [hidden] })).status, 404);
  });

  test('a label is required and an expiry must be in the future', async () => {
    assert.equal((await call(writerJar, 'POST', '/api/wiki-tokens', { label: '  ', wikiIds: [] })).status, 422);
    assert.equal((await call(writerJar, 'POST', '/api/wiki-tokens', { label: 'old', expiresAt: '2001-01-01' })).status, 422);
  });

  test('the 21st active token is 422; a revoked one frees a slot', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await call(hoarderJar, 'POST', '/api/wiki-tokens', { label: `t${i}`, wikiIds: [] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const over = await call(hoarderJar, 'POST', '/api/wiki-tokens', { label: 't20', wikiIds: [] });
    assert.equal(over.status, 422);
    assert.match(over.body.message, /20 active tokens/);
    const list = await call(hoarderJar, 'GET', '/api/wiki-tokens');
    assert.equal((await call(hoarderJar, 'DELETE', `/api/wiki-tokens/${list.body[0].id}`)).status, 200);
    assert.equal((await call(hoarderJar, 'POST', '/api/wiki-tokens', { label: 't20', wikiIds: [] })).status, 200);
  });

  test('the owner renames and rescopes; someone else gets 404 on edit and revoke', async () => {
    const res = await call(writerJar, 'PATCH', `/api/wiki-tokens/${writerToken}`, { label: 'เครื่องใหม่', wikiIds: [] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.label, 'เครื่องใหม่');
    assert.deepEqual(res.body.wikis, []);
    assert.equal(res.body.secret, undefined);
    assert.equal((await call(readerJar, 'PATCH', `/api/wiki-tokens/${writerToken}`, { label: 'mine', wikiIds: [] })).status, 404);
    assert.equal((await call(readerJar, 'DELETE', `/api/wiki-tokens/${writerToken}`)).status, 404);
    assert.equal((await call(readerJar, 'DELETE', `/api/wiki-tokens/${randomUUID()}`)).status, 404);
    assert.equal((await call(readerJar, 'DELETE', '/api/wiki-tokens/not-a-uuid')).status, 404);
  });

  test('a reader cannot allow a token from the wiki; a stranger cannot tell it exists', async () => {
    const mine = await call(readerJar, 'POST', '/api/wiki-tokens', { label: 'reader', wikiIds: [] });
    assert.equal(mine.status, 200);
    assert.equal((await call(readerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [mine.body.token.id] })).status, 403);
    assert.equal((await call(strangerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [] })).status, 404);
  });

  test("a writer allows the wiki on their own token, but someone else's token is 404", async () => {
    const own = await call(ownerJar, 'POST', '/api/wiki-tokens', { label: 'owner', wikiIds: [] });
    ownerToken = own.body.token.id;
    assert.equal((await call(writerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [ownerToken] })).status, 404);
    const ok = await call(writerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [writerToken] });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const list = await call(writerJar, 'GET', '/api/wiki-tokens');
    const t = (list.body as Row[]).find((x) => x.id === writerToken)!;
    assert.deepEqual(t.wikis.map((w: { id: string }) => w.id), [tw]);
    // Unticking every token removes the wiki from all of them.
    assert.equal((await call(writerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [] })).status, 200);
    const cleared = (await call(writerJar, 'GET', '/api/wiki-tokens')).body.find((x: Row) => x.id === writerToken);
    assert.deepEqual(cleared.wikis, []);
  });

  test('a token lists only the scoped wikis its owner can still see', async () => {
    const w = await wikiWithMembers('วิกิที่จะถูกถอด');
    const r = await call(readerJar, 'POST', '/api/wiki-tokens', { label: 'scoped', wikiIds: [w] });
    assert.equal(r.status, 200);
    assert.equal((await call(ownerJar, 'DELETE', `/api/wikis/${w}/members`, { userId: reader.id })).status, 200);
    const t = (await call(readerJar, 'GET', '/api/wiki-tokens')).body.find((x: Row) => x.id === r.body.token.id);
    assert.deepEqual(t.wikis, []);
  });

  test('a non-admin asking for ?all=1 gets 404', async () => {
    assert.equal((await call(writerJar, 'GET', '/api/wiki-tokens?all=1')).status, 404);
    assert.equal((await call(projectAdminJar, 'GET', '/api/wiki-tokens?all=1')).status, 404);
  });

  test("the install admin sees every token with its owner email and revokes another user's", async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const all = await call(installJar, 'GET', '/api/wiki-tokens?all=1');
    assert.equal(all.status, 200);
    const row = (all.body as Row[]).find((x) => x.id === ownerToken);
    assert.ok(row);
    assert.equal(row.ownerEmail, owner.email);
    assert.ok(!JSON.stringify(all.body).includes('"secret"'));
    assert.equal((await call(installJar, 'DELETE', `/api/wiki-tokens/${ownerToken}`)).status, 200);
    const { rows } = await fx.client.query(
      'SELECT wiki_token_revoked_at, wiki_token_revoked_by FROM pmt_wiki_tokens WHERE wiki_token_id = $1', [ownerToken],
    );
    assert.ok(rows[0].wiki_token_revoked_at);
    assert.equal(rows[0].wiki_token_revoked_by, installId);
  });

  test('revoking is irreversible: the row records who and when, and the token cannot be edited back', async () => {
    assert.equal((await call(writerJar, 'DELETE', `/api/wiki-tokens/${writerToken}`)).status, 200);
    const { rows } = await fx.client.query(
      'SELECT wiki_token_revoked_at, wiki_token_revoked_by FROM pmt_wiki_tokens WHERE wiki_token_id = $1', [writerToken],
    );
    assert.ok(rows[0].wiki_token_revoked_at);
    assert.equal(rows[0].wiki_token_revoked_by, writer.id);
    const t = (await call(writerJar, 'GET', '/api/wiki-tokens')).body.find((x: Row) => x.id === writerToken);
    assert.equal(t.status, 'revoked');
    assert.equal((await call(writerJar, 'PUT', `/api/wikis/${tw}/tokens`, { tokenIds: [writerToken] })).status, 404);
    assert.equal((await call(writerJar, 'PATCH', `/api/wiki-tokens/${writerToken}`, { label: 'back', wikiIds: [] })).status, 404);
  });

  test('the token page renders for a signed-in user, and a writer reaches the wiki settings', async () => {
    const res = await fetch(`${BASE_URL}/wiki/tokens`, { headers: { cookie: writerJar.header }, redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.ok(!(await res.text()).includes(writerSecret));
    const settings = await fetch(`${BASE_URL}/wiki/${tw}/settings`, { headers: { cookie: writerJar.header }, redirect: 'manual' });
    assert.equal(settings.status, 200);
    const page = await settings.text();
    assert.ok(page.includes('Allow my token'), 'a writer is drawn the Allow my token panel');
    assert.ok(!page.includes('Transfer ownership') && !page.includes('Add member'), 'and nothing a writer cannot use');
    const asReader = await fetch(`${BASE_URL}/wiki/${tw}/settings`, { headers: { cookie: readerJar.header }, redirect: 'manual' });
    assert.ok(asReader.status >= 300 && asReader.status < 400, 'a reader is sent back to the wiki');
    const index = await fetch(`${BASE_URL}/wiki`, { headers: { cookie: writerJar.header } });
    assert.ok((await index.text()).includes('href="/wiki/tokens"'));
  });
});

/* ------------------------------------------------- deleting a wiki (D-82) */

describe('deleting a wiki', () => {
  let doomedWiki = '';

  before(async () => { doomedWiki = await wikiWithMembers('วิกิที่จะถูกลบ'); });

  test('the owner, a writer and a reader get 403; a stranger and an unknown id get 404', async () => {
    for (const jar of [ownerJar, writerJar, readerJar]) {
      const res = await call(jar, 'DELETE', `/api/wikis/${doomedWiki}`);
      assert.equal(res.status, 403, JSON.stringify(res.body));
    }
    assert.equal((await call(strangerJar, 'DELETE', `/api/wikis/${doomedWiki}`)).status, 404);
    assert.equal((await call(ownerJar, 'DELETE', `/api/wikis/${randomUUID()}`)).status, 404);
    assert.equal((await call(ownerJar, 'DELETE', '/api/wikis/not-a-uuid')).status, 404);
    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${doomedWiki}`)).status, 200, 'a refused delete leaves the wiki');
  });

  test('the install admin deletes it with its pages, history, members, files, link and token scopes', async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const parent = await newPage(writerJar, doomedWiki, { title: 'หน้าแม่' });
    const child = await newPage(writerJar, doomedWiki, { title: 'หน้าลูก', parentId: parent.id });
    await newPage(writerJar, doomedWiki, { title: 'หน้าหลาน', parentId: child.id });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new File([png], 'รูป.png', { type: 'image/png' }));
    const up = await fetch(`${BASE_URL}/api/wikis/${doomedWiki}/assets`, { method: 'POST', headers: { cookie: writerJar.header }, body: form });
    assert.equal(up.status, 200);
    const assetUrl = String(((await up.json()) as { url: string }).url);
    assert.equal((await save(writerJar, parent, `![x](${assetUrl})`)).status, 200);
    const published = await call(ownerJar, 'PATCH', `/api/wikis/${doomedWiki}`, { action: 'publish' });
    const publicToken = published.body.publicToken as string;
    const token = await call(writerJar, 'POST', '/api/wiki-tokens', { label: 'ก่อนลบ', wikiIds: [doomedWiki] });
    assert.equal(token.status, 200, JSON.stringify(token.body));

    const res = await call(installJar, 'DELETE', `/api/wikis/${doomedWiki}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { deleted: true, assetCleanupPending: 0 });

    assert.equal((await call(ownerJar, 'GET', `/api/wikis/${doomedWiki}`)).status, 404);
    assert.equal((await call(installJar, 'GET', `/api/wikis/${doomedWiki}`)).status, 404);
    assert.ok(!(await call(writerJar, 'GET', '/api/wikis')).body.some((w: { id: string }) => w.id === doomedWiki));
    assert.equal((await fetch(`${BASE_URL}${assetUrl}`, { headers: { cookie: writerJar.header } })).status, 404);
    assert.equal((await fetch(`${BASE_URL}/w/${publicToken}`)).status, 404);
    const { rows } = await fx.client.query(
      `SELECT (SELECT count(*) FROM pmt_wikis WHERE wiki_id = $1)::int AS wikis,
              (SELECT count(*) FROM pmt_wiki_pages WHERE wiki_page_wiki_id = $1)::int AS pages,
              (SELECT count(*) FROM pmt_wiki_page_revisions r JOIN pmt_wiki_pages p ON p.wiki_page_id = r.wiki_revision_page_id
                WHERE p.wiki_page_wiki_id = $1)::int AS revisions,
              (SELECT count(*) FROM pmt_wiki_members WHERE wiki_member_wiki_id = $1)::int AS members,
              (SELECT count(*) FROM pmt_wiki_assets WHERE wiki_asset_wiki_id = $1)::int AS assets,
              (SELECT count(*) FROM pmt_wiki_asset_deletions WHERE wiki_asset_deletion_wiki_id = $1)::int AS queued,
              (SELECT count(*) FROM pmt_wiki_token_scopes WHERE wiki_token_scope_wiki_id = $1)::int AS scopes,
              (SELECT count(*) FROM pmt_wiki_tokens WHERE wiki_token_id = $2)::int AS tokens`,
      [doomedWiki, token.body.token.id]);
    assert.deepEqual(rows[0], { wikis: 0, pages: 0, revisions: 0, members: 0, assets: 0, queued: 0, scopes: 0, tokens: 1 },
      'the token itself survives, scoped to nothing');
    assert.equal((await call(installJar, 'DELETE', `/api/wikis/${doomedWiki}`)).status, 404, 'deleting twice is 404');
  });

  test('the settings page draws Delete for the install admin only', async (t) => {
    const w = await create(ownerJar, 'วิกิที่แสดงปุ่มลบ');
    const asOwner = await fetch(`${BASE_URL}/wiki/${w.id}/settings`, { headers: { cookie: ownerJar.header } });
    assert.ok(!(await asOwner.text()).includes('Delete wiki'), 'the owner is not offered Delete');
    if (!installJar) return t.skip(SKIP_INSTALL);
    const asInstall = await fetch(`${BASE_URL}/wiki/${w.id}/settings`, { headers: { cookie: installJar.header } });
    assert.ok((await asInstall.text()).includes('Delete wiki'), 'the install admin is');
  });
});
