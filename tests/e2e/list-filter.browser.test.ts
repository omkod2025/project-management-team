/**
 * The List's typed filters, in a real browser: the Name box narrows rows by
 * what they contain, and a date range — picked in the house date picker,
 * whose calendar is portalled outside the menu — leaves the menu open and
 * hides the rows with no date in that column. The rules themselves are in
 * `tests/list-filter.test.ts`; this defends the wiring.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

const cookiesFor = (header: string) => header.split('; ').map((pair) => {
  const at = pair.indexOf('=');
  return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
});

test('the List filters by contained text and by a date range', async () => {
  const fx = await setup();
  let browser: Browser | undefined;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookiesFor(admin.header));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}`);
    await page.locator('table.run tbody tr').first().waitFor();

    const row = (id: string) => page.locator(`tr#row-${id}`);
    const panel = page.locator('.filterby-panel');

    await page.locator('.filterby .sortby-open').click();
    await panel.getByRole('button', { name: 'Name', exact: true }).click();

    // `%` is the LIKE wildcard; the match opens the tree down to it.
    await panel.getByLabel('Name contains').fill('sub%k');
    await row(fx.nodes.sub).waitFor();
    assert.equal(await row(fx.nodes.module2).count(), 0, 'a module that does not contain the text is hidden');
    await panel.getByRole('button', { name: 'Clear the Name filter' }).click();
    await row(fx.nodes.module2).waitFor();

    // A range end picked in the portalled calendar keeps the menu open.
    await panel.getByRole('button', { name: 'Estimate end', exact: true }).click();
    await panel.getByRole('button', { name: /^Estimate end to/ }).click();
    await page.locator('[data-radix-popper-content-wrapper] button[data-day]').first().click();
    await panel.waitFor();
    assert.ok(await panel.isVisible(), 'choosing a day closed the filter menu');
    assert.equal(
      await panel.getByRole('button', { name: 'Clear the Estimate end filter' }).count(), 1,
      'the range was not taken up',
    );
    // "Other module" has no estimate end, and an empty cell is in no range.
    await row(fx.nodes.module2).waitFor({ state: 'detached' });

    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
