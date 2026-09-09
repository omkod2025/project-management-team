import test from 'node:test';
import assert from 'node:assert/strict';
import { access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';
import { docAssetStorageKey } from '../../src/lib/doc-asset-path.ts';

test('Done editing deletes a removed attachment even after autosave already says Saved', async () => {
  const fx = await setup();
  let browser;
  let disk: string | undefined;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const api = async (url: string, body: unknown) => {
      const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', headers: { cookie: jar.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(res.status, 200, await res.clone().text()); return res.json();
    };
    const form = new FormData(); form.set('kind', 'attachment'); form.set('file', new File(['browser deletion'], 'delete-on-done.txt'));
    const upload = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/doc-assets`, { method: 'POST', headers: { cookie: jar.header }, body: form });
    assert.equal(upload.status, 200);
    const asset = await upload.json();
    const id = asset.url.split('/').at(-1);
    const { rows: assets } = await fx.client.query('SELECT asset_filename, asset_created_at FROM pmt_doc_assets WHERE asset_id=$1', [id]);
    disk = path.join(process.env.DOC_ASSET_DIR || 'data/doc-assets', docAssetStorageKey({ id, filename: assets[0].asset_filename, createdAt: assets[0].asset_created_at }));
    const doc = await api(`/api/projects/${fx.projectId}/docs`, { title: 'Done deletion' });
    const record = await api(`/api/docs/${doc.id}/pages`, { title: 'Remove attachment', content: { body: `[delete-on-done.txt](${asset.url})` } });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    await context.addCookies(jar.header.split('; ').map(pair => { const at=pair.indexOf('='); return { name: pair.slice(0,at), value: pair.slice(at+1), url: BASE_URL }; }));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}/docs/${record.slug}?edit=1`);
    const editor = page.getByRole('textbox', { name: 'Content', exact: true });
    await expect(editor).toBeVisible();
    await editor.press('Control+a'); await editor.press('Backspace');
    await expect.poll(async () => (await fx.client.query('SELECT doc_page_content FROM pmt_doc_pages WHERE doc_page_id=$1', [record.id])).rows[0].doc_page_content.body.includes(id)).toBe(false);
    await expect(page.locator('.editor-savebar [role="status"]')).toHaveText('Saved');
    await access(disk);
    assert.equal((await fetch(`${BASE_URL}${asset.url}`, { headers: { cookie: jar.header } })).status, 200);
    const finalized = page.waitForResponse(response => response.url().endsWith(`/api/doc-pages/${record.id}`) && response.request().postDataJSON()?.finalizeAssets === true);
    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    assert.equal((await finalized).status(), 200);
    await expect(page.getByRole('button', { name: 'Edit page', exact: true })).toBeVisible();
    await assert.rejects(access(disk), { code: 'ENOENT' });
    assert.equal((await fetch(`${BASE_URL}${asset.url}`, { headers: { cookie: jar.header } })).status, 404);
    // A freshly uploaded attachment can be removed before its first autosave.
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    await expect(editor.getByRole('link', { name: 'delete-on-done.txt', exact: false })).toHaveCount(0);
    const uploaded = page.waitForResponse(response => response.url().endsWith(`/api/projects/${fx.projectId}/doc-assets`) && response.request().method() === 'POST');
    await page.getByLabel('Attach file to Content', { exact: true }).setInputFiles({ name: 'new-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('new') });
    const newAsset = await (await uploaded).json();
    const newId = newAsset.url.split('/').at(-1);
    const { rows: newRows } = await fx.client.query('SELECT asset_filename, asset_created_at FROM pmt_doc_assets WHERE asset_id=$1', [newId]);
    disk = path.join(process.env.DOC_ASSET_DIR || 'data/doc-assets', docAssetStorageKey({ id: newId, filename: newRows[0].asset_filename, createdAt: newRows[0].asset_created_at }));
    await expect(editor.getByRole('link', { name: /new-upload\.txt/ })).toBeVisible();
    await editor.press('Control+a'); await editor.press('Backspace');
    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit page', exact: true })).toBeVisible();
    await assert.rejects(access(disk), { code: 'ENOENT' });
  } finally {
    await browser?.close();
    if (disk) { try { await unlink(disk); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
    await fx.client.query('DELETE FROM pmt_doc_asset_deletions WHERE deletion_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
