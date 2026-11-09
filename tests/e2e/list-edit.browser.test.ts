import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';
import { pickDate } from '../helpers/date-picker.ts';

test('Task and Defect cells edit only through their pencil buttons', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const api = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${BASE_URL}/api/${path}`, {
        method, headers: { cookie: admin.header, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    await api(`projects/${fx.projectId}/fields`, 'POST', { name: 'Details', kind: 'long_text' });
    const rows = await api(`defects/projects/${fx.projectId}/ledger`);
    const defect = await api('defects/nodes', 'POST', { parentId: rows[0].led_node_id, name: 'Module' });
    const slug = (await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_slug;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addCookies(admin.header.split('; ').map(pair => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [kind, id] of [['task', fx.nodes.module], ['defect', defect.led_node_id]]) {
      await page.goto(`${BASE_URL}/p/${slug}${kind === 'defect' ? '/defects' : ''}`);
      const row = page.locator(`#row-${id}`);
      const name = row.locator('td.nm');
      await name.click();
      await name.dblclick();
      await name.press('F2');
      await name.press('Enter');
      await expect(row.locator('input.cell-input')).toHaveCount(0);
      const date = row.locator('td').filter({ has: page.getByRole('button', { name: 'Edit Estimate Start for Module', exact: true }) });
      await date.click({ position: { x: 8, y: 12 } });
      await date.press('Enter');
      await expect(date.locator('input')).toHaveCount(0);
      await expect(page.locator('[data-slot=calendar]')).toHaveCount(0);
      await row.getByRole('button', { name: 'Rename Module', exact: true }).click();
      await expect(name.locator('input.cell-input')).toBeVisible();
      await name.locator('input.cell-input').fill('Renamed module');
      await name.locator('input.cell-input').press('Enter');
      await expect(row.locator('.name-text')).toHaveText('Renamed module');
      await row.getByRole('button', { name: 'Edit Estimate Start for Renamed module', exact: true }).click();
      // The shared date picker opens at once; choosing a day commits it.
      await pickDate(page, '2026-09-02');
      const picker = page.locator('[data-slot=popover-content]');
      await expect(row.locator('td').filter({ has: page.getByRole('button', { name: 'Edit Estimate Start for Renamed module', exact: true }) })).toContainText('02 Sep');
      // Escape closes the picker without writing anything.
      await row.getByRole('button', { name: 'Edit Estimate Start for Renamed module', exact: true }).click();
      await expect(picker).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await row.getByRole('button', { name: 'Open Details', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Details', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('textarea')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await row.getByRole('button', { name: 'Edit Details for Renamed module', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Details', exact: true }).fill('Edited with the pencil');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(row.getByRole('button', { name: 'Open Details', exact: true })).toHaveText('Edited with the pencil');
      await page.reload();
      await expect(row.locator('.name-text')).toHaveText('Renamed module');
      await expect(row.getByRole('button', { name: 'Open Details', exact: true })).toHaveText('Edited with the pencil');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
