import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('selecting and updating tasks preserves the list filter', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    const slug = rows[0].project_slug;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addCookies(admin.header.split('; ').map((pair) => {
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${slug}`);
    const filter = page.locator('.filterby > button');
    await filter.click();
    await page.getByRole('group', { name: 'Filter by' }).getByRole('button', { name: 'Module', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Module', exact: true }).check();
    await page.keyboard.press('Escape');
    const other = page.locator(`#row-${fx.nodes.module2}`);
    await expect(other).toHaveCount(0);

    // Each rename also selects a different row and updates ?node= locally.
    for (const [id, name] of [[fx.nodes.task, 'Task'], [fx.nodes.module, 'Module']]) {
      const row = page.locator(`#row-${id}`);
      await row.hover();
      await row.getByRole('button', { name: `Rename ${name}`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`node=${id}`));
      await row.locator('input.cell-input').fill(`${name} updated`);
      const saved = page.waitForResponse((response) => response.url().endsWith(`/api/nodes/${id}`) && response.request().method() === 'PATCH' && response.ok());
      await row.locator('input.cell-input').press('Enter');
      await saved;
      await expect(row.getByRole('button', { name: `Rename ${name} updated`, exact: true })).toBeVisible();
      await expect(filter).toHaveText('Filter1');
      await expect(other).toHaveCount(0);
    }
    await filter.click();
    await expect(page.getByRole('checkbox', { name: 'Module updated', exact: true })).toBeChecked();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, `fieldbook:${slug}:filter`)).toBe(1);

    // An incoming link must still reveal a task excluded by the saved filter.
    await page.goto(`${BASE_URL}/p/${slug}?node=${fx.nodes.module2}`);
    await expect(other).toBeVisible();
    await expect(filter).toHaveText('Filter');
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
