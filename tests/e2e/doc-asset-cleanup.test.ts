import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';
import { docAssetStorageKey } from '../../src/lib/doc-asset-path.ts';

test('Doc assets delete only on Done, preserving undo, shared references and failed saves', async () => {
  const fx = await setup();
  const paths = new Set<string>();
  const root = path.resolve(process.env.DOC_ASSET_DIR || 'data/doc-assets');
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const viewer = await signIn(fx.viewer.email, fx.viewer.password);
    const request = (url: string, method = 'GET', body?: unknown, cookie = admin.header) => fetch(`${BASE_URL}${url}`, {
      method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ok = async (url: string, method: string, body: unknown) => {
      const res = await request(url, method, body);
      assert.equal(res.status, 200, await res.clone().text());
      return res.json();
    };
    const doc = await ok(`/api/projects/${fx.projectId}/docs`, 'POST', { title: 'Deletion checks' });
    const create = (body = '') => ok(`/api/docs/${doc.id}/pages`, 'POST', { title: 'Page', content: { body } });
    const upload = async (legacy = false) => {
      let id: string;
      if (legacy) {
        id = randomUUID();
        await fx.client.query('INSERT INTO pmt_doc_assets (asset_id, asset_project_id, asset_uploader_id, asset_filename, asset_mime, asset_bytes) VALUES ($1,$2,$3,$4,$5,4)', [id, fx.projectId, fx.admin.id, 'legacy.txt', 'application/octet-stream']);
      } else {
        const form = new FormData(); form.set('kind', 'attachment'); form.set('file', new File(['test'], 'same-name.txt'));
        const res = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: admin.header }, body: form });
        assert.equal(res.status, 200); id = (await res.json()).url.split('/').at(-1);
      }
      const { rows } = await fx.client.query('SELECT asset_filename, asset_created_at FROM pmt_doc_assets WHERE asset_id=$1', [id]);
      const disk = path.join(root, legacy ? id : docAssetStorageKey({ id, filename: rows[0].asset_filename, createdAt: rows[0].asset_created_at }));
      paths.add(disk);
      if (legacy) { await mkdir(root, { recursive: true }); await writeFile(disk, 'test', { flag: 'wx' }); }
      return { id, url: `/api/doc-assets/${id}`, disk };
    };
    const save = async (page: { id: string; updatedAt: string }, body: string, finalizeAssets = false, extras = {}) => {
      const result = await ok(`/api/doc-pages/${page.id}`, 'PATCH', { updatedAt: page.updatedAt, content: { body }, finalizeAssets, ...extras });
      page.updatedAt = result.updatedAt; return result;
    };
    const missing = async (file: { url: string; disk: string }) => {
      assert.equal((await request(file.url)).status, 404);
      await assert.rejects(access(file.disk), { code: 'ENOENT' });
    };
    const file = await upload();
    const link = `[file](${file.url})`;
    const page = await create(link);
    await save(page, 'removed');
    await access(file.disk);
    assert.equal((await request(file.url)).status, 200);
    await save(page, link); // Undo after autosave remains possible.
    await save(page, link, true);
    await access(file.disk);
    const stale = page.updatedAt;
    await save(page, 'removed again');
    assert.equal((await request(`/api/doc-pages/${page.id}`, 'PATCH', { updatedAt: stale, content: { body: '' }, finalizeAssets: true })).status, 409);
    assert.equal((await request(`/api/doc-pages/${page.id}`, 'PATCH', { updatedAt: page.updatedAt, content: { body: '' }, finalizeAssets: true }, viewer.header)).status, 403);
    await access(file.disk);
    assert.equal((await save(page, 'removed again', true)).assetCleanupPending, 0);
    await missing(file);
    assert.equal((await request(`/api/doc-pages/${page.id}`, 'PATCH', { updatedAt: page.updatedAt, content: { body: link } })).status, 422);

    const shared = await upload();
    await save(page, `[shared](${shared.url})`);
    const other = await create(`[shared](${shared.url})`);
    await save(other, ''); // Other page has not pressed Done yet.
    await save(page, '', true);
    await access(shared.disk);
    await save(other, '', true);
    await missing(shared);

    const legacy = await upload(true);
    await save(page, `[legacy](${legacy.url})`);
    await save(page, '');
    await access(legacy.disk);
    await save(page, '', true);
    await missing(legacy);

    const unused = await upload(); // Upload, then remove before first autosave.
    await save(page, '', true, { uploadedAssets: [unused.url] });
    await missing(unused);

    const held = await upload();
    await save(page, `[held](${held.url})`);
    await fx.client.query('UPDATE pmt_nodes SET node_custom_values=$1 WHERE node_id=$2', [JSON.stringify({ reference: held.url }), fx.nodes.task]);
    await save(page, '', true);
    await access(held.disk);
    await fx.client.query("UPDATE pmt_nodes SET node_custom_values='{}' WHERE node_id=$1", [fx.nodes.task]);

    const retry = await upload();
    await save(page, `[retry](${retry.url})`);
    await save(page, '');
    // A non-file at the synthetic upload path simulates an unlink failure.
    assert.ok(retry.disk.startsWith(root + path.sep));
    await unlink(retry.disk); await mkdir(retry.disk);
    assert.equal((await save(page, '', true)).assetCleanupPending, 1);
    await rmdir(retry.disk);
    // Autosave must not consume even a previously committed deletion queue.
    await save(page, 'autosaved');
    assert.equal((await fx.client.query('SELECT count(*)::int AS count FROM pmt_doc_asset_deletions WHERE deletion_asset_id=$1', [retry.id])).rows[0].count, 1);
    assert.equal((await save(page, 'autosaved', true)).assetCleanupPending, 0);
    await missing(retry);
  } finally {
    for (const disk of paths) { try { await unlink(disk); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { try { await rmdir(disk); } catch {} } } }
    await fx.client.query('DELETE FROM pmt_doc_asset_deletions WHERE deletion_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
