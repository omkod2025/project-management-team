import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('roster opens, saves and refreshes a task, while viewers can only read', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const viewer = await signIn(fx.viewer.email, fx.viewer.password);
    const endpoint = `${BASE_URL}/api/nodes/${fx.nodes.task}`;
    assert.equal((await fetch(endpoint)).status, 401);
    await fx.client.query('DELETE FROM pmt_project_members WHERE member_project_id = $1 AND member_user_id = $2', [fx.projectId, fx.viewer.id]);
    assert.equal((await fetch(endpoint, { headers: { cookie: viewer.header } })).status, 404);
    await fx.client.query("INSERT INTO pmt_project_members (member_project_id, member_user_id, member_role) VALUES ($1, $2, 'viewer')", [fx.projectId, fx.viewer.id]);

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const cookies = (header: string) => header.split('; ').map((pair) => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    });
    await context.addCookies(cookies(admin.header));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE_URL}/timeline`);
    await page.getByLabel('Module', { exact: true }).fill('Module');
    // Soloing exposes every item, including bars otherwise truncated by packing.
    await page.locator('.rs-name.unassigned').click();
    const task = page.locator(`a.rs-item[href$="node=${fx.nodes.task}"]`);
    await task.locator('.bar').first().click();
    const modal = page.getByRole('dialog', { name: 'Task details' });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Task name', { exact: true }).fill('Updated from roster');
    await modal.getByLabel('Estimate end', { exact: true }).fill('2026-09-18');
    await modal.getByLabel('Task Status', { exact: true }).selectOption(fx.options.running);
    await page.route('**/api/nodes/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Please retry saving.' }) });
      } else await route.continue();
    });
    await modal.getByRole('button', { name: 'Save changes' }).click();
    await expect(modal.getByRole('alert')).toHaveText('Please retry saving.');
    await expect(modal.getByLabel('Task name', { exact: true })).toHaveValue('Updated from roster');
    await page.unroute('**/api/nodes/*');
    await modal.getByRole('button', { name: 'Save changes' }).click();
    await expect(modal).not.toBeVisible();
    await expect(task).toHaveAttribute('title', /Updated from roster/);
    await expect(page.getByLabel('Module', { exact: true })).toHaveValue('Module');
    const saved = await (await fetch(endpoint, { headers: { cookie: admin.header } })).json();
    assert.equal(saved.row.led_name, 'Updated from roster');
    assert.equal(saved.row.led_estimate_end, '2026-09-18');
    assert.equal(saved.row.led_custom_values[fx.statusFieldId], fx.options.running);

    await task.locator('.bar').first().click();
    await expect(modal.getByLabel('Task name', { exact: true })).toHaveValue('Updated from roster');
    await modal.getByLabel('Task name', { exact: true }).fill('Do not save this');
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(page.locator('.rs-name.unassigned')).toHaveAttribute('aria-pressed', 'true');
    await expect(task).toHaveAttribute('title', /Updated from roster/);

    await context.clearCookies();
    await context.addCookies(cookies(viewer.header));
    await page.reload();
    await page.locator('.rs-name.unassigned').click();
    await task.locator('.bar').first().click();
    await expect(modal.getByLabel('Task name', { exact: true })).toBeDisabled();
    await expect(modal.getByLabel('Estimate end', { exact: true })).toBeDisabled();
    await expect(modal.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await modal.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, 'modal fits a mobile viewport');
    assert.equal((await fetch(endpoint, {
      method: 'PATCH', headers: { cookie: viewer.header, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Not allowed' }),
    })).status, 403);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await fx.cleanup(); }
});
