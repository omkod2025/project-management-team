/**
 * Project Docs over MCP (central MCP tokens design, Task 6).
 *
 * What it defends: a Docs grant never outranks its owner's project role; a
 * page reads back as Markdown with its Thai intact; an edit carries the
 * page's `updatedAt` and a stale one is told to reread; an MCP edit can never
 * drop a file link (so nothing is queued for removal) nor touch a protected
 * page; and a doc in a project outside the token's scope is "Not found.".
 */

import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { setup, signIn, makeUser, BASE_URL, type Fixture, type Jar } from '../helpers/harness.ts';
import { docAssetStorageKey } from '../../src/lib/doc-asset-path.ts';

const ALL = ['create_doc', 'create_page', 'write_page'];

let fx: Fixture;
let jar: Jar;
let rpcId = 0;
const tokens: string[] = [];
const assets: string[] = [];
const other = { projectId: randomUUID(), docId: randomUUID() };

async function api(method: string, urlPath: string, body?: unknown, as = jar) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method, headers: { cookie: as.header, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function mint(as = jar, grants: string[] = ALL, projectIds = [fx.projectId]) {
  const r = await api('POST', '/api/tokens', { label: 'MCP docs test', grants: { docs: grants }, scope: { projectIds } }, as);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  tokens.push(r.body.token.id);
  return r.body.secret as string;
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

async function refused(secret: string, name: string, args: Record<string, unknown>) {
  const r = await call(secret, name, args);
  assert.equal(r.isError, true, JSON.stringify(r));
  return r.content[0].text as string;
}

/** A Free page in a fresh doc, made through MCP by the admin. */
async function freshPage(secret: string, markdown?: string) {
  const doc = await ok(secret, 'create_doc', { project_id: fx.projectId, title: `เอกสาร ${randomBytes(3).toString('hex')}` });
  const page = await ok(secret, 'create_doc_page', { doc_id: doc.id, title: 'หน้าทดสอบ', ...(markdown === undefined ? {} : { markdown }) });
  return { doc, page };
}

before(async () => {
  fx = await setup();
  jar = await signIn(fx.admin.email, fx.admin.password);
  const tag = randomBytes(4).toString('hex');
  await fx.client.query(
    `INSERT INTO pmt_projects (project_id, project_name, project_slug) VALUES ($1, $2, $3)`,
    [other.projectId, `E2E docs other ${tag}`, `e2e-docs-other-${tag}`]);
  await fx.client.query(
    `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'admin')`,
    [other.projectId, fx.admin.id]);
  await fx.client.query(
    `INSERT INTO pmt_docs (doc_id, doc_project_id, doc_title) VALUES ($1, $2, 'นอกขอบเขต')`,
    [other.docId, other.projectId]);
});

afterEach(async () => {
  if (tokens.length) await fx.client.query('DELETE FROM pmt_access_tokens WHERE access_token_id = ANY($1)', [tokens.splice(0)]);
});

after(async () => {
  if (!fx) return;
  for (const id of assets) {
    const { rows } = await fx.client.query('SELECT asset_filename, asset_created_at FROM pmt_doc_assets WHERE asset_id = $1', [id]);
    if (!rows[0]) continue;
    const key = docAssetStorageKey({ id, filename: rows[0].asset_filename, createdAt: rows[0].asset_created_at });
    await unlink(path.join(process.env.DOC_ASSET_DIR || 'data/doc-assets', key)).catch(() => undefined);
  }
  await fx.client.query('DELETE FROM pmt_projects WHERE project_id = $1', [other.projectId]);
  await fx.cleanup();
});

test("a member owner's create_doc grant cannot create a doc", async () => {
  const member = await makeUser(fx.client, 'docs-member');
  await fx.client.query(
    `INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'member')`,
    [fx.projectId, member.id]);
  const memberJar = await signIn(member.email, member.password);
  const secret = await mint(memberJar);
  const text = await refused(secret, 'create_doc', { project_id: fx.projectId, title: 'ห้ามสร้าง' });
  assert.match(text, /E_FORBIDDEN/);
  const { rows } = await fx.client.query(`SELECT 1 FROM pmt_docs WHERE doc_project_id = $1 AND doc_title = 'ห้ามสร้าง'`, [fx.projectId]);
  assert.equal(rows.length, 0);
});

test('admin owner creates a doc and a page, reads it back as Markdown', async () => {
  const secret = await mint();
  const body = '# ขอบเขตงาน\n\n- ส่งมอบระยะที่หนึ่ง';
  const { doc, page } = await freshPage(secret, body);
  assert.equal(doc.title.startsWith('เอกสาร'), true);

  const docs = await ok(secret, 'list_docs', { project_id: fx.projectId });
  assert.ok(docs.some((d: { id: string }) => d.id === doc.id));

  const pages = await ok(secret, 'list_doc_pages', { doc_id: doc.id.toUpperCase() });
  assert.deepEqual(pages.map((p: { id: string; title: string; template: string; protected: boolean }) =>
    [p.id, p.title, p.template, p.protected]), [[page.id, 'หน้าทดสอบ', 'free', false]]);

  const read = await ok(secret, 'read_doc_page', { page_id: page.id, include_rich_content: true });
  assert.equal(read.title, 'หน้าทดสอบ');
  assert.equal(read.docTitle, doc.title);
  assert.equal(read.template, 'free');
  assert.deepEqual(read.sections, { body });
  assert.deepEqual(read.rich_content, { body: null });
  assert.equal(read.updatedAt, page.updatedAt);
});

test('update_doc_page with a stale updatedAt returns the reread message', async () => {
  const secret = await mint();
  const { page } = await freshPage(secret, 'ฉบับแรก');
  const first = await ok(secret, 'update_doc_page', { page_id: page.id, markdown: 'ฉบับที่สอง', updatedAt: page.updatedAt });
  assert.notEqual(first.updatedAt, page.updatedAt);

  const text = await refused(secret, 'update_doc_page', { page_id: page.id, markdown: 'เขียนทับ', updatedAt: page.updatedAt });
  assert.match(text, /This page changed\. Read it again before retrying your edit\./);
  const read = await ok(secret, 'read_doc_page', { page_id: page.id });
  assert.deepEqual(read.sections, { body: 'ฉบับที่สอง' });
});

test('an edit that drops an asset link is refused and pmt_doc_asset_removals stays empty', async () => {
  const secret = await mint();
  const { page } = await freshPage(secret);

  const form = new FormData();
  form.set('file', new File(['แผนงาน'], 'แผนงาน.txt', { type: 'text/plain' }));
  form.set('kind', 'attachment');
  const upload = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: jar.header }, body: form });
  assert.equal(upload.status, 200);
  const asset = await upload.json();
  const assetId = asset.url.split('/').at(-1);
  assets.push(assetId);

  const seeded = await api('PATCH', `/api/doc-pages/${page.id}`, { content: { body: `ไฟล์แนบ [แผนงาน.txt](${asset.url})` }, updatedAt: page.updatedAt });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

  const text = await refused(secret, 'update_doc_page', { page_id: page.id, markdown: 'ไม่มีไฟล์แล้ว', updatedAt: seeded.body.updatedAt });
  assert.match(text, /This edit would remove a file from the page/);

  const { rows } = await fx.client.query('SELECT 1 FROM pmt_doc_asset_removals WHERE removal_page_id = $1', [page.id]);
  assert.equal(rows.length, 0);
  const read = await ok(secret, 'read_doc_page', { page_id: page.id });
  assert.equal(read.sections.body, `ไฟล์แนบ [แผนงาน.txt](${asset.url})`);
});

test('a protected page cannot be edited', async () => {
  const secret = await mint();
  const { page } = await freshPage(secret, 'ห้ามแก้');
  await fx.client.query('UPDATE pmt_doc_pages SET doc_page_protected = true WHERE doc_page_id = $1', [page.id]);
  const read = await ok(secret, 'read_doc_page', { page_id: page.id });
  const text = await refused(secret, 'update_doc_page', { page_id: page.id, markdown: 'แก้แล้ว', updatedAt: read.updatedAt });
  assert.match(text, /E_FORBIDDEN/);
  assert.deepEqual((await ok(secret, 'read_doc_page', { page_id: page.id })).sections, { body: 'ห้ามแก้' });
});

test('a doc in an unscoped project is Not found.', async () => {
  const secret = await mint();
  for (const [name, args] of [
    ['list_docs', { project_id: other.projectId }],
    ['list_doc_pages', { doc_id: other.docId }],
    ['create_doc', { project_id: other.projectId, title: 'x' }],
    ['create_doc_page', { doc_id: other.docId, title: 'x' }],
    ['list_doc_pages', { doc_id: 'not-a-uuid' }],
    ['read_doc_page', { page_id: randomUUID() }],
  ] as const) {
    assert.equal(await refused(secret, name, args), 'Not found.', `${name} ${JSON.stringify(args)}`);
  }
  const { rows } = await fx.client.query('SELECT 1 FROM pmt_doc_pages WHERE doc_page_doc_id = $1', [other.docId]);
  assert.equal(rows.length, 0);
});
