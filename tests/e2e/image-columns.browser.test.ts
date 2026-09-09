import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, patchNode, BASE_URL } from '../helpers/harness.ts';

test('image columns browse, paste, persist, remove and enforce access', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const viewer = await signIn(fx.viewer.email, fx.viewer.password);
    const response = await fetch(`${BASE_URL}/api/projects/${fx.projectId}/fields`, {
      method: 'POST', headers: { cookie: admin.header, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Screenshots', kind: 'image' }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const field = await response.json();
    const upload = async (cookie: string, name: string, type: string, data: Uint8Array) => {
      const form = new FormData(); form.set('file', new File([new Uint8Array(data)], name, { type })); form.set('fieldId', field.id);
      return fetch(`${BASE_URL}/api/nodes/${fx.nodes.task}/images`, { method: 'POST', headers: { cookie }, body: form });
    };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    assert.equal((await upload(viewer.header, 'image.png', 'image/png', png)).status, 403);
    assert.equal((await upload(admin.header, 'bad.html', 'text/html', png)).status, 422);
    const uncommon = await upload(admin.header, 'camera.heic', '', png);
    assert.equal(uncommon.status, 200);
    const asset = await uncommon.json();
    const download = await fetch(`${BASE_URL}${asset.url}`, { headers: { cookie: viewer.header } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') || '', /attachment/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    assert.equal((await patchNode(admin, fx.nodes.task, { values: { [field.id]: ['/api/doc-assets/12345678-1234-1234-1234-123456789abc'] } })).status, 422);
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addCookies(admin.header.split('; ').map((pair) => {
      const i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}`);
    const headers = await page.locator('table.run thead tr').last().locator('th').allTextContents();
    const index = headers.findIndex((h) => h.includes('Screenshots'));
    assert.ok(index >= 0, JSON.stringify(headers));
    const cell = page.locator(`#row-${fx.nodes.module} > td`).nth(index);
    await cell.click();
    const editor = page.getByRole('group', { name: 'Screenshots images' });
    await editor.locator('input[type=file]').setInputFiles({ name: 'browse.png', mimeType: 'image/png', buffer: png });
    await expect(editor.locator('.image-draft img')).toHaveCount(1);
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await editor.evaluate((element, bytes) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], 'paste.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, Array.from(png));
    await expect(editor.locator('.image-draft img')).toHaveCount(2);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(cell.locator('.image-links img')).toHaveCount(2);
    await expect.poll(async () => (await fx.client.query('SELECT node_custom_values FROM pmt_nodes WHERE node_id = $1', [fx.nodes.module])).rows[0].node_custom_values[field.id]?.length).toBe(2);
    await page.reload();
    await expect(cell.locator('.image-links img')).toHaveCount(2);
    await cell.click({ position: { x: 100, y: 12 } });
    await editor.getByRole('button', { name: 'Remove image 1', exact: true }).click();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await fx.client.query('SELECT node_custom_values FROM pmt_nodes WHERE node_id = $1', [fx.nodes.module])).rows[0].node_custom_values[field.id]?.length).toBe(1);
  } finally { await browser?.close(); await fx.cleanup(); }
});
