/**
 * The wiki's MCP endpoint, through the real API (wiki spec §6b, §7, §8).
 *
 * This is the only way AI reaches the wiki, and it is read-only. These tests
 * defend that: a Bearer token is the whole credential (no session, no public
 * link secret), what a token reads is decided again on every request
 * (scope ∩ what its owner can see right now), a refusal reveals nothing, and
 * no tool can write.
 *
 * The rate limit is per token, so tests that make many calls each mint their
 * own token rather than spend the shared one's 60-a-minute budget.
 *
 * The install admin (`admin@cit.com`) follows the same pattern as
 * `wiki.test.ts`: a throwaway account if it does not exist, the real one only
 * with E2E_INSTALL_ADMIN_PASSWORD, otherwise those cases are skipped.
 */

import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

const INSTALL_EMAIL = 'admin@cit.com';
const SKIP_INSTALL = 'set E2E_INSTALL_ADMIN_PASSWORD to run install-admin cases';
const MCP = `${BASE_URL}/api/mcp`;
const TOOLS = ['list_pages', 'list_wikis', 'read_page', 'search'];
const INJECTION = [
  "'); DROP TABLE pmt_wikis; --",
  `' OR '1'='1`,
  '"; SELECT pg_sleep(1); --',
  '$$ \\ ; -- ปลั๊ก',
  '%_\\',
];

let fx: Fixture;
type U = { id: string; email: string; password: string };
let alice: U, bob: U, carol: U;
let aliceJar: Jar, bobJar: Jar, carolJar: Jar;

let installJar: Jar | null = null;
let createdInstallId = '';

const wikiIds: string[] = [];

/** bob owns; alice is a read member. Scoped on alice's token. */
let shared = '';
/** alice owns; scoped. */
let mine = '';
/** alice owns; NOT scoped. */
let unscoped = '';
/** bob owns; alice cannot see it — a scope row is forced in by SQL. */
let hidden = '';
/** alice owns; scoped, then archived. */
let archived = '';

let parentPage = '', mermaidPage = '', archivedPage = '', hiddenPage = '';
let mermaidSlug = '';
/** alice's general-purpose secret: scoped to shared, mine, archived (+hidden by SQL). */
let secret = '';

const MERMAID_SOURCE = 'graph TD\n  A["ปลั๊ก \' \\" ; -- $$ \\\\"] --> B{ตัดสินใจ}\n  B -->|ใช่| C[[จบ]]';
const RICH_BODY = 'fieldbook-rich-v1:' + JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'แผนภาพการติดตั้ง' }] },
    { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: MERMAID_SOURCE }] },
  ],
});

async function call(jar: Jar | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(jar ? { cookie: jar.header } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function createWiki(jar: Jar, title: string) {
  const res = await call(jar, 'POST', '/api/wikis', { title });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  wikiIds.push(res.body.id);
  return res.body.id as string;
}

async function newPage(jar: Jar, wiki: string, input: Record<string, unknown>) {
  const res = await call(jar, 'POST', `/api/wikis/${wiki}/pages`, input);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as { id: string; slug: string; updatedAt: string };
}

async function mintToken(jar: Jar, scope: string[], label = 'mcp') {
  const res = await call(jar, 'POST', '/api/wiki-tokens', { label, wikiIds: scope });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { id: res.body.token.id as string, secret: res.body.secret as string };
}

let rpcId = 0;

/** One JSON-RPC message to /api/mcp. `auth` is the whole Authorization header, or null for none. */
async function rpc(auth: string | null, method: string, params?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(auth ? { authorization: auth } : {}),
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params !== undefined ? { params } : {}) }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body, text };
}

const bearer = (s: string) => `Bearer ${s}`;

/** `tools/call` that must succeed at the HTTP and JSON-RPC level; returns the tool result. */
async function tool(sec: string, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(bearer(sec), 'tools/call', { name, arguments: args });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.result, res.text);
  return res.body.result as { isError?: boolean; content: Array<{ type: string; text: string }> };
}

/** The tool's JSON payload, asserting it is not an error. */
async function payload(sec: string, name: string, args: Record<string, unknown> = {}) {
  const r = await tool(sec, name, args);
  assert.ok(!r.isError, JSON.stringify(r));
  assert.equal(r.content[0]?.type, 'text');
  return JSON.parse(r.content[0]!.text);
}

async function assertNotFound(sec: string, name: string, args: Record<string, unknown>) {
  const r = await tool(sec, name, args);
  assert.equal(r.isError, true, JSON.stringify(r));
  assert.equal(r.content[0]?.text, 'Not found.');
}

async function lastUsed(tokenId: string): Promise<number | null> {
  const { rows } = await fx.client.query('SELECT wiki_token_last_used_at FROM pmt_wiki_tokens WHERE wiki_token_id = $1', [tokenId]);
  const v = rows[0]?.wiki_token_last_used_at as Date | null;
  return v ? v.getTime() : null;
}

before(async () => {
  fx = await setup();
  alice = await makeUser(fx.client, 'mcp-alice');
  bob = await makeUser(fx.client, 'mcp-bob');
  carol = await makeUser(fx.client, 'mcp-carol');
  [aliceJar, bobJar, carolJar] = await Promise.all([
    signIn(alice.email, alice.password),
    signIn(bob.email, bob.password),
    signIn(carol.email, carol.password),
  ]);

  shared = await createWiki(bobJar, 'คู่มือฮาร์ดแวร์');
  assert.equal((await call(bobJar, 'PUT', `/api/wikis/${shared}/members`, { userId: alice.id, access: 'read' })).status, 200);
  mine = await createWiki(aliceJar, 'บันทึกของอลิซ');
  unscoped = await createWiki(aliceJar, 'ไม่ได้ให้โทเค็น');
  hidden = await createWiki(bobJar, 'ลับเฉพาะบ็อบ');
  archived = await createWiki(aliceJar, 'เก็บแล้ว');

  const parent = await newPage(bobJar, shared, { title: 'การติดตั้ง', slug: 'install' });
  parentPage = parent.id;
  const m = await newPage(bobJar, shared, { title: 'แผนภาพ', slug: 'diagram', parentId: parentPage, body: RICH_BODY });
  mermaidPage = m.id;
  mermaidSlug = m.slug;
  const gone = await newPage(bobJar, shared, { title: 'หน้าที่เก็บแล้ว', slug: 'gone', body: 'ปลั๊กเก่า' });
  archivedPage = gone.id;
  assert.equal((await call(bobJar, 'POST', `/api/wiki-pages/${gone.id}`, { action: 'archive' })).status, 200);
  hiddenPage = (await newPage(bobJar, hidden, { title: 'ปลั๊กลับ', slug: 'secret', body: 'ปลั๊กลับ' })).id;
  await newPage(aliceJar, mine, { title: 'ปลั๊กของอลิซ', slug: 'plug', body: 'ปลั๊กไฟสามขา' });
  await newPage(aliceJar, unscoped, { title: 'ปลั๊กไม่ได้ให้', slug: 'plug', body: 'ปลั๊กไฟ' });
  await newPage(aliceJar, archived, { title: 'ปลั๊กในวิกิที่เก็บ', slug: 'plug', body: 'ปลั๊กไฟ' });

  const t = await mintToken(aliceJar, [shared, mine, archived]);
  secret = t.secret;
  // A scope row on a wiki alice cannot see. The API refuses to create one;
  // forcing it proves the intersection is computed on read, not trusted.
  await fx.client.query(
    'INSERT INTO pmt_wiki_token_scopes (wiki_token_scope_token_id, wiki_token_scope_wiki_id) VALUES ($1, $2)', [t.id, hidden],
  );
  assert.equal((await call(aliceJar, 'PATCH', `/api/wikis/${archived}`, { action: 'archive' })).status, 200);

  const { rows } = await fx.client.query('SELECT user_id FROM pmt_users WHERE lower(user_email) = $1', [INSTALL_EMAIL]);
  if (rows.length === 0) {
    const password = randomBytes(18).toString('base64url');
    createdInstallId = randomUUID();
    await fx.client.query(
      `INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash)
       VALUES ($1, $2, 'E2E install', $3)`,
      [createdInstallId, INSTALL_EMAIL, await hashPassword(password)],
    );
    installJar = await signIn(INSTALL_EMAIL, password);
    console.log('# install admin: created a throwaway admin@cit.com');
  } else if (process.env.E2E_INSTALL_ADMIN_PASSWORD) {
    installJar = await signIn(INSTALL_EMAIL, process.env.E2E_INSTALL_ADMIN_PASSWORD);
    console.log('# install admin: signed in to the existing admin@cit.com');
  } else {
    console.log('# install admin: existing admin@cit.com, no password: install-admin cases skipped');
  }
});

after(async () => {
  if (fx) {
    if (wikiIds.length) await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_id = ANY($1)', [wikiIds]);
    if (createdInstallId) await fx.client.query('DELETE FROM pmt_users WHERE user_id = $1', [createdInstallId]);
  }
  await fx?.cleanup();
});

describe('authentication', () => {
  test('initialize succeeds with a valid token', async () => {
    const res = await rpc(bearer(secret), 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '0' },
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.result.serverInfo.name, 't-timeline-wiki');
    assert.ok(res.body.result.capabilities.tools);
  });

  test('no Authorization header is 401 with WWW-Authenticate: Bearer', async () => {
    const res = await rpc(null, 'initialize', {});
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer/);
    assert.deepEqual(res.body, { error: 'invalid_token' });
  });

  test('a pmw_ secret that matches nothing is 401', async () => {
    assert.equal((await rpc(bearer(`pmw_${randomBytes(32).toString('base64url')}`), 'tools/list')).status, 401);
    assert.equal((await rpc(bearer('pmw_garbage'), 'tools/list')).status, 401);
    assert.equal((await rpc('Basic ' + Buffer.from('a:b').toString('base64'), 'tools/list')).status, 401);
  });

  test('a valid session cookie and no Bearer header is 401', async () => {
    const res = await fetch(MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', cookie: aliceJar.header },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 401);
  });

  test("a wiki's public link secret is not a Bearer token", async () => {
    const pub = await call(aliceJar, 'PATCH', `/api/wikis/${mine}`, { action: 'publish' });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    const publicToken = pub.body.publicToken as string;
    assert.ok(publicToken);
    assert.equal((await rpc(bearer(publicToken), 'tools/list')).status, 401);
    assert.equal((await rpc(bearer(`pmw_${publicToken}`), 'tools/list')).status, 401);
    assert.equal((await call(aliceJar, 'PATCH', `/api/wikis/${mine}`, { action: 'unpublish' })).status, 200);
  });

  test('GET and DELETE are 405', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(MCP, { method, headers: { authorization: bearer(secret) } });
      assert.equal(res.status, 405, method);
    }
  });
});

describe('tools', () => {
  test('tools/list names exactly the four tools, each readOnlyHint', async () => {
    const res = await rpc(bearer(secret), 'tools/list', {});
    assert.equal(res.status, 200, res.text);
    const tools = res.body.result.tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, t.name);
  });

  test('list_wikis returns scope ∩ visible, minus archived — and nothing an owner email or public link', async () => {
    const r = await tool(secret, 'list_wikis');
    const list = JSON.parse(r.content[0]!.text) as Array<{ id: string; title: string; description: string; pageCount: number }>;
    assert.deepEqual(list.map((w) => w.id).sort(), [shared, mine].sort());
    const s = list.find((w) => w.id === shared)!;
    assert.equal(s.title, 'คู่มือฮาร์ดแวร์');
    assert.equal(s.pageCount, 2, 'the archived page is not counted');
    assert.deepEqual(Object.keys(s).sort(), ['description', 'id', 'pageCount', 'title']);
    assert.ok(!r.content[0]!.text.includes(bob.email));
    assert.ok(!r.content[0]!.text.includes('publicToken'));
  });

  test('list_pages returns the tree; an unscoped, hidden, archived or malformed wiki is Not found.', async () => {
    const pages = await payload(secret, 'list_pages', { wiki_id: shared }) as Array<Record<string, unknown>>;
    assert.deepEqual(pages.map((p) => p.id).sort(), [parentPage, mermaidPage].sort());
    const child = pages.find((p) => p.id === mermaidPage)!;
    assert.deepEqual(Object.keys(child).sort(), ['depth', 'id', 'parentId', 'slug', 'title', 'updatedAt']);
    assert.equal(child.parentId, parentPage);
    assert.equal(child.depth, 2);
    assert.equal(child.slug, 'diagram');
    for (const wiki_id of [unscoped, hidden, archived, randomUUID(), 'not-a-uuid']) {
      await assertNotFound(secret, 'list_pages', { wiki_id });
    }
  });

  test('read_page returns Markdown with the Mermaid fence byte-identical to the saved source', async () => {
    const byId = await payload(secret, 'read_page', { page_id: mermaidPage });
    assert.equal(byId.title, 'แผนภาพ');
    assert.equal(byId.wikiTitle, 'คู่มือฮาร์ดแวร์');
    assert.deepEqual(byId.breadcrumb, ['การติดตั้ง']);
    assert.ok(byId.updatedAt);
    assert.ok(byId.markdown.includes('```mermaid\n' + MERMAID_SOURCE + '\n```'), byId.markdown);
    const bySlug = await payload(secret, 'read_page', { wiki_id: shared, slug: mermaidSlug });
    assert.deepEqual(bySlug, byId);
  });

  test('ids are case-insensitive: an uppercase page_id or wiki_id reads the same page', async () => {
    const byId = await payload(secret, 'read_page', { page_id: mermaidPage });
    assert.deepEqual(await payload(secret, 'read_page', { page_id: mermaidPage.toUpperCase() }), byId);
    assert.deepEqual(await payload(secret, 'read_page', { wiki_id: shared.toUpperCase(), slug: mermaidSlug }), byId);
    const pages = await payload(secret, 'list_pages', { wiki_id: shared.toUpperCase() }) as unknown[];
    assert.equal(pages.length, 2);
  });

  test('read_page outside scope, archived or malformed is Not found.', async () => {
    await assertNotFound(secret, 'read_page', { page_id: hiddenPage });
    await assertNotFound(secret, 'read_page', { page_id: archivedPage });
    await assertNotFound(secret, 'read_page', { page_id: randomUUID() });
    await assertNotFound(secret, 'read_page', { page_id: 'not-a-uuid' });
    await assertNotFound(secret, 'read_page', { wiki_id: shared, slug: 'gone' });
    await assertNotFound(secret, 'read_page', { wiki_id: hidden, slug: 'secret' });
    await assertNotFound(secret, 'read_page', { wiki_id: unscoped, slug: 'plug' });
    await assertNotFound(secret, 'read_page', { wiki_id: archived, slug: 'plug' });
    await assertNotFound(secret, 'read_page', {});
  });

  test('search finds only pages in effective, live wikis', async () => {
    const hits = await payload(secret, 'search', { query: 'ปลั๊ก' }) as Array<{ pageId: string; wikiId: string }>;
    assert.ok(hits.length >= 1);
    for (const h of hits) assert.ok([shared, mine].includes(h.wikiId), JSON.stringify(h));
    assert.ok(!hits.some((h) => h.pageId === archivedPage || h.pageId === hiddenPage));
    const one = await payload(secret, 'search', { query: 'ปลั๊ก', wiki_id: mine }) as Array<{ wikiId: string }>;
    assert.ok(one.length >= 1);
    for (const h of one) assert.equal(h.wikiId, mine);
    await assertNotFound(secret, 'search', { query: 'ปลั๊ก', wiki_id: hidden });
    await assertNotFound(secret, 'search', { query: 'ปลั๊ก', wiki_id: 'nope' });
  });

  test('search limit is clamped to 1..20', async () => {
    const one = await payload(secret, 'search', { query: 'ปลั๊ก', limit: 1 });
    assert.equal(one.length, 1);
    const zero = await payload(secret, 'search', { query: 'ปลั๊ก', limit: 0 });
    assert.equal(zero.length, 1, 'limit 0 is clamped up to 1, not widened to the default');
  });

  test('injection strings as search.query and read_page.slug: no 500, [] and Not found.', async () => {
    // Scoped to a wiki whose text contains none of these strings — `shared`
    // holds a Mermaid label with `$$ \ ; --` in it, which search rightly finds.
    const t = await mintToken(aliceJar, [mine], 'injection');
    for (const s of INJECTION) {
      assert.deepEqual(await payload(t.secret, 'search', { query: s }), [], s);
      await assertNotFound(t.secret, 'read_page', { wiki_id: mine, slug: s });
    }
    const { rows } = await fx.client.query("SELECT to_regclass('pmt_wikis') AS t");
    assert.ok(rows[0]?.t);
  });

  test('no tool can write: create_page is an error and the page count is unchanged', async () => {
    const count = async () => Number((await fx.client.query(
      'SELECT count(*) FROM pmt_wiki_pages WHERE wiki_page_wiki_id = ANY($1)', [wikiIds],
    )).rows[0].count);
    const before = await count();
    const res = await rpc(bearer(secret), 'tools/call', { name: 'create_page', arguments: { wiki_id: shared, title: 'x' } });
    assert.equal(res.status, 200, res.text);
    assert.ok(res.body.error || res.body.result?.isError, res.text);
    assert.equal(await count(), before);
  });

  test('errors carry no stack trace or database message', async () => {
    for (const args of [{ page_id: "'; --" }, { page_id: 5 }, { wiki_id: ['x'], slug: { a: 1 } }]) {
      const res = await rpc(bearer(secret), 'tools/call', { name: 'read_page', arguments: args });
      assert.equal(res.status, 200, res.text);
      assert.ok(res.body.error || res.body.result?.isError, res.text);
      assert.ok(!/at \w+ \(|node_modules|pmt_|postgres|syntax error/i.test(res.text), res.text);
    }
  });
});

describe('effective scope is decided on every request', () => {
  test('a token loses a wiki the moment its owner loses membership, and regains it', async () => {
    const t = await mintToken(aliceJar, [shared], 'membership');
    assert.equal((await payload(t.secret, 'read_page', { page_id: mermaidPage })).title, 'แผนภาพ');
    assert.equal((await call(bobJar, 'DELETE', `/api/wikis/${shared}/members`, { userId: alice.id })).status, 200);
    try {
      await assertNotFound(t.secret, 'read_page', { page_id: mermaidPage });
      assert.deepEqual(await payload(t.secret, 'list_wikis'), []);
    } finally {
      assert.equal((await call(bobJar, 'PUT', `/api/wikis/${shared}/members`, { userId: alice.id, access: 'read' })).status, 200);
    }
    assert.equal((await payload(t.secret, 'read_page', { page_id: mermaidPage })).title, 'แผนภาพ');
  });
});

describe('token life cycle', () => {
  test('a token revoked by its owner is 401 next call, and the refused call leaves last_used_at alone', async () => {
    const t = await mintToken(aliceJar, [shared], 'revoke-own');
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    // Push last_used_at back so a call that was (wrongly) accepted would rewrite it.
    await fx.client.query(`UPDATE pmt_wiki_tokens SET wiki_token_last_used_at = now() - interval '1 hour' WHERE wiki_token_id = $1`, [t.id]);
    const stamped = await lastUsed(t.id);
    assert.equal((await call(aliceJar, 'DELETE', `/api/wiki-tokens/${t.id}`)).status, 200);
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 401);
    assert.equal(await lastUsed(t.id), stamped);
  });

  test('a token revoked by the install admin is 401 next call, last_used_at unchanged', async (t) => {
    if (!installJar) return t.skip(SKIP_INSTALL);
    const tok = await mintToken(aliceJar, [shared], 'revoke-admin');
    assert.equal((await rpc(bearer(tok.secret), 'tools/list')).status, 200);
    await fx.client.query(`UPDATE pmt_wiki_tokens SET wiki_token_last_used_at = now() - interval '1 hour' WHERE wiki_token_id = $1`, [tok.id]);
    const stamped = await lastUsed(tok.id);
    assert.equal((await call(installJar, 'DELETE', `/api/wiki-tokens/${tok.id}`)).status, 200);
    assert.equal((await rpc(bearer(tok.secret), 'tools/list')).status, 401);
    assert.equal(await lastUsed(tok.id), stamped);
  });

  test('an expired token is 401', async () => {
    const t = await mintToken(aliceJar, [shared], 'expired');
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    await fx.client.query(`UPDATE pmt_wiki_tokens SET wiki_token_expires_at = now() - interval '1 minute' WHERE wiki_token_id = $1`, [t.id]);
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 401);
  });

  test("a deactivated owner's token is 401", async () => {
    const own = await createWiki(carolJar, 'ของแคโรล');
    const t = await mintToken(carolJar, [own], 'carol');
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    await fx.client.query('UPDATE pmt_users SET user_is_active = false WHERE user_id = $1', [carol.id]);
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 401);
  });

  test('last_used_at is written once for two calls within a minute, and again after one', async () => {
    const t = await mintToken(aliceJar, [shared], 'throttle');
    assert.equal(await lastUsed(t.id), null);
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    const first = await lastUsed(t.id);
    assert.ok(first);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    assert.equal(await lastUsed(t.id), first, 'the second call within 60 s does not write');
    await fx.client.query(`UPDATE pmt_wiki_tokens SET wiki_token_last_used_at = now() - interval '2 minutes' WHERE wiki_token_id = $1`, [t.id]);
    const old = await lastUsed(t.id);
    assert.equal((await rpc(bearer(t.secret), 'tools/list')).status, 200);
    assert.ok((await lastUsed(t.id))! > old!, 'a call after a minute writes again');
  });
});

describe('rate limit', () => {
  test('the 61st call within a minute is 429', async () => {
    const t = await mintToken(aliceJar, [shared], 'rate');
    const statuses: number[] = [];
    for (let i = 0; i < 60; i++) statuses.push((await rpc(bearer(t.secret), 'ping')).status);
    assert.deepEqual([...new Set(statuses)], [200]);
    assert.equal((await rpc(bearer(t.secret), 'ping')).status, 429);
    // Another token is not affected.
    assert.equal((await rpc(bearer(secret), 'ping')).status, 200);
  });
});
