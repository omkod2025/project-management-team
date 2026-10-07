import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('Task and Defect tabs, inline edits, attachments, settings and archive undo', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const slug = (await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_slug;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(admin.header.split('; ').map(pair => {
      const i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    const errors: string[] = [];
    const requests: { path: string; kind: string | null; document: boolean }[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      requests.push({ path: url.pathname, kind: url.searchParams.get('kind'), document: request.resourceType() === 'document' });
    });
    page.on('pageerror', err => errors.push(err.message));
    const taskBadge = page.waitForResponse(r => new URL(r.url()).pathname === '/api/notifications' && new URL(r.url()).searchParams.get('kind') === 'task');
    await page.goto(`${BASE_URL}/p/${slug}`);
    await taskBadge;
    await expect(page.locator(`#row-${fx.nodes.module}`)).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'List type' });
    await expect(tabs.getByRole('link', { name: 'Task', exact: true })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Defect', exact: true }).hover();
    await page.waitForTimeout(350); // Give hover/viewport prefetch a chance to fire if accidentally enabled.
    assert.ok(!requests.some(r => r.path === `/p/${slug}/defects`), 'inactive Defect tab must not be prefetched');
    assert.ok(requests.filter(r => r.path === '/api/notifications').every(r => r.kind === 'task'));
    const navigationStart = performance.now();
    const defectBadge = page.waitForResponse(r => new URL(r.url()).pathname === '/api/notifications' && new URL(r.url()).searchParams.get('kind') === 'defect');
    void defectBadge.catch(() => {});
    let releaseNavigation!: () => void;
    const navigationGate = new Promise<void>(resolve => { releaseNavigation = resolve; });
    await page.route(url => url.pathname === `/p/${slug}/defects`, async route => {
      await navigationGate;
      await route.continue();
    });
    const navigate = tabs.getByRole('link', { name: 'Defect', exact: true }).click();
    try {
      await expect(page.getByRole('status').filter({ hasText: 'กำลังโหลด Defect' })).toBeVisible();
      await expect(page.locator('header.head')).toBeVisible();
      await expect(tabs).toBeVisible();
      await expect(tabs.getByRole('status')).toHaveCount(0);
      await expect(page.locator('.table-region .table-loading')).toBeVisible();
      const headerBox = await page.locator('header.head').boundingBox();
      const loadingBox = await page.locator('.table-loading').boundingBox();
      assert.ok(headerBox && loadingBox && loadingBox.y >= headerBox.y + headerBox.height,
        'loading stays below the header, inside the table area');
    } finally {
      releaseNavigation();
    }
    await navigate;
    await defectBadge;
    await expect(page.getByRole('status').filter({ hasText: 'กำลังโหลด Defect' })).toHaveCount(0);
    await expect(tabs.getByRole('link', { name: 'Defect', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('cell', { name: 'No modules yet. + Add module' })).toBeVisible();
    console.log(`Task → Defect ready: ${Math.round(performance.now() - navigationStart)} ms`);
    assert.equal(requests.filter(r => r.document).length, 1, 'switch tabs without reloading the document');
    const defectRequests = requests.length;
    await tabs.getByRole('link', { name: 'Task', exact: true }).hover();
    await page.waitForTimeout(350);
    assert.ok(!requests.slice(defectRequests).some(r => r.path === `/p/${slug}`), 'inactive Task tab must not be prefetched');
    await page.getByRole('button', { name: '+ Add module', exact: true }).click();
    await page.getByRole('button', { name: 'Rename Untitled', exact: true }).click();
    const editor = page.locator('input.cell-input');
    await editor.fill('Defect area');
    await editor.press('Enter');
    await expect(page.getByText('Defect area', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Add a subtask under Defect area', exact: true }).click();
    await page.getByRole('button', { name: 'Rename Untitled', exact: true }).click();
    await editor.fill('Defect only');
    await editor.press('Enter');
    await expect(page.getByText('Defect only', { exact: true })).toBeVisible();
    const id = (await fx.client.query("SELECT node_id FROM pmt_defect_nodes WHERE node_project_id=$1 AND node_name='Defect only'", [fx.projectId])).rows[0].node_id;
    await tabs.getByRole('link', { name: 'Task', exact: true }).click();
    await expect(page.locator(`#row-${fx.nodes.module}`)).toBeVisible();
    await expect(page.getByText('Defect only', { exact: true })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Defect', exact: true }).click();
    await expect(tabs.getByRole('link', { name: 'Defect', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', `/p/${slug}/defects/settings`);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Defect settings', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'New column name' }).fill('Screenshots');
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('image');
    await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'New column name' }) }).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Column name', exact: true }).last()).toHaveValue('Screenshots');
    await page.getByRole('link', { name: 'List', exact: true }).click();
    const headers = await page.locator('table.run thead tr').last().locator('th').allTextContents();
    const cell = page.locator(`#row-${id} > td`).nth(headers.findIndex(h => h.includes('Screenshots')));
    await cell.getByRole('button', { name: 'Edit Screenshots for Defect only' }).click();
    const imageEditor = page.getByRole('group', { name: 'Screenshots images' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await imageEditor.locator('input[type=file]').setInputFiles({ name: 'defect.png', mimeType: 'image/png', buffer: png });
    await expect(imageEditor.locator('.image-draft img')).toHaveCount(1);
    await expect(imageEditor.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await imageEditor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(cell.locator('.image-links img')).toHaveCount(1);
    await page.reload();
    await expect(cell.locator('.image-links img')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Search defects' }).fill('does not match');
    await expect(page.locator(`#row-${id}`)).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search defects' }).fill('');
    await page.locator(`#row-${id}`).hover();
    await page.getByRole('button', { name: 'Archive Defect only', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive it', exact: true }).click();
    await expect(page.locator(`#row-${id}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator(`#row-${id}`)).toBeVisible();
    await page.screenshot({ path: 'data/defects-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 760, height: 900 });
    await expect(tabs.getByRole('link', { name: 'Task', exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Defect', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    assert.equal((await fx.client.query('SELECT count(*)::int AS n FROM pmt_nodes WHERE node_project_id=$1', [fx.projectId])).rows[0].n, 5);
  } finally {
    await browser?.close();
    await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
