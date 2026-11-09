import test, { before, after, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, makeUser, signIn, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { encodeRich } from '../../src/lib/doc-rich-content.ts';

let fx: Fixture;
let owner: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let jar: Jar;
let otherJar: Jar;
let wiki: string;
let foreignWiki: string;
let rpcId = 0;
const wikiIds: string[] = [];
const tokens: string[] = [];
const base = ['list_pages', 'list_wikis', 'read_page', 'search'];
const permissions = ['create_wiki', 'create_page', 'write_wiki'];

async function api(method: string, path: string, body?: unknown, as = jar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers: { cookie: as.header, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function mint(grants: string[] = [], wikiScope = [wiki]) {
  const r = await api('POST', '/api/wiki-tokens', { label: 'MCP write test', permissions: grants, wikiIds: wikiScope });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  tokens.push(r.body.token.id);
  return { id: r.body.token.id as string, secret: r.body.secret as string, row: r.body.token };
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

async function restPage(wikiId = wiki, as = jar, body = 'เดิม') {
  const r = await api('POST', `/api/wikis/${wikiId}/pages`, { title: 'หน้า', body }, as);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

before(async () => {
  fx = await setup();
  owner = await makeUser(fx.client, 'mcp-write-owner');
  other = await makeUser(fx.client, 'mcp-write-other');
  jar = await signIn(owner.email, owner.password);
  otherJar = await signIn(other.email, other.password);
  for (const as of [jar, otherJar]) {
    const r = await api('POST', '/api/wikis', { title: 'ทดสอบ MCP write' }, as);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    wikiIds.push(r.body.id);
  }
  wiki = wikiIds[0]!;
  foreignWiki = wikiIds[1]!;
});

afterEach(async () => {
  if (tokens.length) await fx.client.query('DELETE FROM pmt_wiki_tokens WHERE wiki_token_id = ANY($1)', [tokens.splice(0)]);
});

after(async () => {
  if (fx) {
    await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_owner_id = ANY($1)', [[owner?.id, other?.id].filter(Boolean)]);
    await fx.cleanup();
  }
});

describe('MCP token permissions and writes', () => {
  test('token API preserves omitted permissions, clears explicit empty set and refuses invalid grants', async () => {
    const t = await mint(['create_page']);
    assert.deepEqual(t.row.permissions, ['create_page']);
    const legacy = await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'legacy', wikiIds: [wiki] });
    assert.deepEqual(legacy.body.permissions, ['create_page']);
    const cleared = await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'cleared', wikiIds: [wiki], permissions: [] });
    assert.deepEqual(cleared.body.permissions, []);
    assert.equal((await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'bad', wikiIds: [wiki], permissions: ['delete_wiki'] })).status, 422);
    assert.equal((await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'intruder', wikiIds: [], permissions }, otherJar)).status, 404);
  });

  test('all eight permission sets advertise exact capabilities', async () => {
    for (let mask = 0; mask < 8; mask++) {
      const grants = permissions.filter((_, i) => mask & (1 << i));
      const t = await mint(grants);
      const r = await rpc(t.secret, 'tools/list');
      const expected = [...base, ...(grants.includes('create_wiki') ? ['create_wiki'] : []), ...(grants.includes('create_page') ? ['create_page'] : []), ...(grants.includes('write_wiki') ? ['update_wiki', 'update_page'] : [])];
      assert.deepEqual(r.body.result.tools.map((v: { name: string }) => v.name).sort(), expected.sort());
      for (const tool of r.body.result.tools) assert.equal(tool.annotations.readOnlyHint, base.includes(tool.name));
    }
  });

  test('create wiki from empty scope adds only this token and does not imply page permissions', async () => {
    const t = await mint(['create_wiki'], []);
    const second = await mint([], []);
    const created = await ok(t.secret, 'create_wiki', { title: 'ใหม่จาก MCP', description: 'รายละเอียด' });
    assert.equal(created.title, 'ใหม่จาก MCP');
    assert.ok((await ok(t.secret, 'list_wikis')).some((w: { id: string }) => w.id === created.id));
    assert.deepEqual(await ok(second.secret, 'list_wikis'), []);
    const { rows } = await fx.client.query('SELECT wiki_owner_id FROM pmt_wikis WHERE wiki_id = $1', [created.id]);
    assert.equal(rows[0].wiki_owner_id, owner.id);
    assert.equal((await call(t.secret, 'create_page', { wiki_id: created.id, title: 'forbidden', markdown: '' })).isError, true);
  });

  test('wiki creation rolls back when adding scope fails', async () => {
    const t = await mint(['create_wiki'], []);
    const title = `rollback-${randomUUID()}`;
    await fx.client.query(`ALTER TABLE pmt_wiki_token_scopes ADD CONSTRAINT mcp_write_fault CHECK (wiki_token_scope_token_id <> '${t.id}'::uuid)`);
    try {
      assert.equal((await call(t.secret, 'create_wiki', { title })).isError, true);
      assert.equal((await fx.client.query('SELECT wiki_id FROM pmt_wikis WHERE wiki_title = $1', [title])).rowCount, 0);
    } finally { await fx.client.query('ALTER TABLE pmt_wiki_token_scopes DROP CONSTRAINT mcp_write_fault'); }
  });

  test('create and update pages are independent, retain Thai and Mermaid and detect stale writes', async () => {
    const t = await mint(['create_page']);
    const markdown = 'คู่มือใหม่\n\n```mermaid\nflowchart LR\n A --> B\n```';
    const p = await ok(t.secret, 'create_page', { wiki_id: wiki, title: 'สร้างหน้า', markdown });
    assert.equal((await ok(t.secret, 'read_page', { page_id: p.id })).markdown, markdown);
    assert.equal((await call(t.secret, 'update_page', { page_id: p.id, markdown: 'ห้าม', updatedAt: p.updatedAt })).isError, true);
    await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'write only', wikiIds: [wiki], permissions: ['write_wiki'] });
    assert.equal((await call(t.secret, 'create_page', { wiki_id: wiki, title: 'ห้าม', markdown: '' })).isError, true);
    const saved = await ok(t.secret, 'update_page', { page_id: p.id, markdown: markdown + '\n\nแก้ไขล่าสุด', title: 'แก้ชื่อ', updatedAt: p.updatedAt });
    const conflict = await call(t.secret, 'update_page', { page_id: p.id, markdown: 'ทับข้อมูล', updatedAt: p.updatedAt });
    assert.equal(JSON.parse(conflict.content[0].text).error.code, 'E_DOC_CONFLICT');
    assert.notEqual(saved.updatedAt, p.updatedAt);
    const read = await ok(t.secret, 'read_page', { page_id: p.id });
    assert.equal(read.markdown, markdown + '\n\nแก้ไขล่าสุด');
    assert.equal(read.title, 'แก้ชื่อ');
    assert.ok((await ok(t.secret, 'search', { query: 'แก้ไขล่าสุด' })).some((v: { pageId: string }) => v.pageId === p.id));
    const history = await fx.client.query('SELECT wiki_revision_editor_id FROM pmt_wiki_page_revisions WHERE wiki_revision_page_id = $1', [p.id]);
    assert.equal(history.rows[0].wiki_revision_editor_id, owner.id);
  });

  test('write member can edit pages but cannot edit wiki metadata; read member cannot write', async () => {
    const p = await restPage(foreignWiki, otherJar);
    await api('PUT', `/api/wikis/${foreignWiki}/members`, { userId: owner.id, access: 'read' }, otherJar);
    const t = await mint(permissions, [foreignWiki]);
    assert.equal((await call(t.secret, 'create_page', { wiki_id: foreignWiki, title: 'no', markdown: '' })).isError, true);
    assert.equal((await call(t.secret, 'update_page', { page_id: p.id, markdown: 'no', updatedAt: p.updatedAt })).isError, true);
    assert.ok((await ok(t.secret, 'list_pages', { wiki_id: foreignWiki })).length);
    await api('PUT', `/api/wikis/${foreignWiki}/members`, { userId: owner.id, access: 'write' }, otherJar);
    await ok(t.secret, 'update_page', { page_id: p.id, markdown: 'write member', updatedAt: p.updatedAt });
    assert.equal((await call(t.secret, 'update_wiki', { wiki_id: foreignWiki, title: 'no' })).isError, true);
    await api('DELETE', `/api/wikis/${foreignWiki}/members`, { userId: owner.id }, otherJar);
    assert.equal((await call(t.secret, 'create_page', { wiki_id: foreignWiki, title: 'no', markdown: '' })).content[0].text, 'Not found.');
  });

  test('metadata updates are atomic, omitted fields stay and empty description clears', async () => {
    const t = await mint(['write_wiki']);
    await ok(t.secret, 'update_wiki', { wiki_id: wiki, title: 'ชื่อใหม่', description: 'รายละเอียดใหม่' });
    await ok(t.secret, 'update_wiki', { wiki_id: wiki, description: '' });
    const details = (await ok(t.secret, 'list_wikis')).find((w: { id: string }) => w.id === wiki);
    assert.equal(details.title, 'ชื่อใหม่');
    assert.equal(details.description, '');
    assert.equal((await call(t.secret, 'update_wiki', { wiki_id: wiki, title: 'invalid partial write', description: 'x'.repeat(100000) })).isError, true);
    assert.equal((await ok(t.secret, 'list_wikis')).find((w: { id: string }) => w.id === wiki).title, 'ชื่อใหม่');
  });

  test('scope, parent isolation, archive and unsupported actions cannot be bypassed', async () => {
    const p = await restPage(foreignWiki, otherJar);
    const t = await mint(permissions);
    for (const id of [foreignWiki, randomUUID(), 'malformed']) {
      assert.equal((await call(t.secret, 'update_wiki', { wiki_id: id, title: 'no' })).content[0].text, 'Not found.');
      assert.equal((await call(t.secret, 'create_page', { wiki_id: id, title: 'no', markdown: '' })).content[0].text, 'Not found.');
    }
    assert.equal((await call(t.secret, 'update_page', { page_id: p.id, markdown: 'no', updatedAt: p.updatedAt })).content[0].text, 'Not found.');
    assert.equal((await call(t.secret, 'create_page', { wiki_id: wiki, title: 'no', markdown: '', parent_id: p.id })).isError, true);
    for (const action of ['archive', 'restore', 'transfer', 'publish', 'unpublish', 'delete']) {
      assert.equal((await call(t.secret, 'update_wiki', { wiki_id: wiki, title: 'no', action })).isError, true);
    }
    const a = await api('POST', '/api/wikis', { title: 'archived target' });
    await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'archived', wikiIds: [a.body.id], permissions });
    await api('PATCH', `/api/wikis/${a.body.id}`, { action: 'archive' });
    assert.equal((await call(t.secret, 'update_wiki', { wiki_id: a.body.id, title: 'no' })).content[0].text, 'Not found.');
  });

  test('cached client loses removed grants and revoked token cannot write', async () => {
    const t = await mint(permissions);
    await rpc(t.secret, 'tools/list');
    await api('PATCH', `/api/wiki-tokens/${t.id}`, { label: 'removed', wikiIds: [wiki], permissions: [] });
    assert.equal((await call(t.secret, 'create_wiki', { title: 'no' })).isError, true);
    await api('DELETE', `/api/wiki-tokens/${t.id}`);
    assert.equal((await rpc(t.secret, 'tools/call', { name: 'create_wiki', arguments: { title: 'no' } })).status, 401);
  });

  test('wiki settings changes scope without changing permissions', async () => {
    const t = await mint(['create_page'], []);
    const r = await api('PUT', `/api/wikis/${wiki}/tokens`, { tokenIds: [t.id] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const list = await api('GET', '/api/wiki-tokens');
    const row = list.body.find((v: { id: string }) => v.id === t.id);
    assert.deepEqual(row.permissions, ['create_page']);
    assert.ok(row.wikis.some((v: { id: string }) => v.id === wiki));
  });

  test('rich content can be read and updated as Markdown without losing Thai or diagrams', async () => {
    const rich = encodeRich({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'คู่มือภาษาไทย' }] },
      { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'flowchart LR\n A --> B' }] },
    ] });
    const page = await restPage(wiki, jar, rich);
    const t = await mint(['write_wiki']);
    const before = await ok(t.secret, 'read_page', { page_id: page.id });
    await ok(t.secret, 'update_page', { page_id: page.id, markdown: before.markdown, updatedAt: before.updatedAt });
    const after = await ok(t.secret, 'read_page', { page_id: page.id });
    assert.equal(after.markdown, before.markdown);
    assert.match(after.markdown, /คู่มือภาษาไทย/);
    assert.match(after.markdown, /```mermaid/);
  });

  test('expired or inactive-owner tokens cannot write, and archived pages stay hidden', async () => {
    const p = await restPage();
    const t = await mint(permissions);
    await api('POST', `/api/wiki-pages/${p.id}`, { action: 'archive' });
    assert.equal((await call(t.secret, 'update_page', { page_id: p.id, markdown: '', updatedAt: p.updatedAt })).content[0].text, 'Not found.');
    await fx.client.query('UPDATE pmt_wiki_tokens SET wiki_token_expires_at = now() - interval \'1 minute\' WHERE wiki_token_id = $1', [t.id]);
    assert.equal((await rpc(t.secret, 'tools/call', { name: 'create_wiki', arguments: { title: 'no' } })).status, 401);
    const active = await mint(permissions);
    await fx.client.query('UPDATE pmt_users SET user_is_active = false WHERE user_id = $1', [owner.id]);
    try {
      assert.equal((await rpc(active.secret, 'tools/call', { name: 'create_wiki', arguments: { title: 'no' } })).status, 401);
    } finally { await fx.client.query('UPDATE pmt_users SET user_is_active = true WHERE user_id = $1', [owner.id]); }
  });

  test('page depth and Markdown limits retain existing validation', async () => {
    const t = await mint(['create_page']);
    const parent = await ok(t.secret, 'create_page', { wiki_id: wiki, title: 'one', markdown: '' });
    const child = await ok(t.secret, 'create_page', { wiki_id: wiki, title: 'two', markdown: '', parent_id: parent.id });
    const leaf = await ok(t.secret, 'create_page', { wiki_id: wiki, title: 'three', markdown: '', parent_id: child.id });
    const deep = await call(t.secret, 'create_page', { wiki_id: wiki, title: 'four', markdown: '', parent_id: leaf.id });
    assert.equal(JSON.parse(deep.content[0].text).error.code, 'E_MAX_DEPTH');
    assert.equal((await call(t.secret, 'create_page', { wiki_id: wiki, title: 'long', markdown: 'x'.repeat(200001) })).isError, true);
  });
});
