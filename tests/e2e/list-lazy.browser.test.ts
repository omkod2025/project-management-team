import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';
import { mkdir } from 'node:fs/promises';

test('Task and Defect render individual nearby rows, preserve edits, and reveal navigation targets', async () => {
  const fx = await setup();
  let browser;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const slug = (await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId])).rows[0].project_slug;
    const response = await fetch(`${BASE_URL}/api/defects/projects/${fx.projectId}/ledger`, { headers: { cookie: admin.header } });
    assert.equal(response.status, 200);
    const defectRows = await response.json();
    const root = (await fx.client.query('SELECT node_id FROM pmt_nodes WHERE node_project_id=$1 AND node_depth=1', [fx.projectId])).rows[0].node_id;
    // Many modules exercise both normal rows and repeated headers offscreen.
    for (const [table, rootId] of [['pmt_nodes', root], ['pmt_defect_nodes', defectRows[0].led_node_id]]) {
      await fx.client.query(`INSERT INTO ${table}
        (node_project_id, node_parent_id, node_depth, node_name, node_sort_order)
        SELECT $1, $2, 2, 'Lazy module ' || lpad(i::text, 3, '0'), i
        FROM generate_series(1, 150) i`, [fx.projectId, rootId]);
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(admin.header.split('; ').map(pair => {
      const at = pair.indexOf('=');
      return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.addInitScript(() => {
      const paints: number[] = [];
      Object.assign(window, { rowMountPaints: paints });
      let paint = 0;
      const tick = () => { paint++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      new MutationObserver(records => {
        for (const record of records) {
          if (record.oldValue === 'false' && (record.target as Element).getAttribute('data-row-mounted') === 'true') paints.push(paint);
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-row-mounted'], attributeOldValue: true });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const kind of ['task', 'defect']) {
      const url = `${BASE_URL}/p/${slug}${kind === 'defect' ? '/defects' : ''}`;
      await page.goto(url);
      await expect(page.locator('table.run > tbody > tr.grouphead').first()).toBeAttached();
      const bodyRows = page.locator('table.run > tbody > tr');
      await expect.poll(() => bodyRows.count()).toBeGreaterThan(400);
      await expect.poll(() => page.locator('table.run > tbody > tr[data-row-mounted="true"]').count()).toBeLessThan(60);
      const firstRow = page.locator('tr[id^="row-"]').first();
      const firstId = await firstRow.getAttribute('id');
      await expect(firstRow).toHaveAttribute('data-row-mounted', 'true');
      await expect.poll(() => page.evaluate(() => (window as unknown as { rowMountPaints: number[] }).rowMountPaints.length)).toBeGreaterThan(8);
      const paints = await page.evaluate(() => (window as unknown as { rowMountPaints: number[] }).rowMountPaints);
      assert.equal(new Set(paints).size, paints.length, 'initial rows commit at most one per animation frame');
      const initialHeight = await page.locator('.scroller').evaluate(el => el.scrollHeight);
      await page.locator('.scroller').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(page.locator('table.run .name-text', { hasText: 'Lazy module 150' })).toBeVisible();
      await expect(page.locator(`#${firstId}`)).toHaveAttribute('data-row-mounted', 'false');
      await expect.poll(() => page.locator('table.run > tbody > tr[data-row-mounted="true"]').count()).toBeLessThan(60);
      await page.locator('.scroller').evaluate(el => { el.scrollTop = 0; });
      await expect(page.locator(`#${firstId} .name-text`)).toBeVisible();
      const restoredHeight = await page.locator('.scroller').evaluate(el => el.scrollHeight);
      assert.ok(Math.abs(restoredHeight - initialHeight) <= 4,
        `row placeholders preserve scroll height: ${initialHeight} -> ${restoredHeight}`);
      if (kind === 'task') {
        await mkdir('data', { recursive: true });
        await page.screenshot({ path: 'data/list-lazy-polish-desktop.png' });
        for (const width of [768, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.locator('.scroller').evaluate(el => { el.scrollTop = el.scrollHeight; });
          await expect(page.locator('table.run .name-text', { hasText: 'Lazy module 150' })).toBeVisible();
          await page.locator('.scroller').evaluate(el => { el.scrollTop = 0; });
          await expect(page.locator(`#${firstId} .name-text`)).toBeVisible();
          await expect(page.locator('header.head')).toBeVisible();
          await page.screenshot({ path: `data/list-lazy-polish-${width}.png` });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
      }

      // An in-progress edit stays mounted even when scrolled out of view.
      const editable = page.locator(`#${firstId}`);
      await editable.hover();
      await editable.getByRole('button', { name: /^Rename / }).click();
      const input = editable.locator('input.cell-input');
      await input.fill('Unsaved draft stays here');
      await page.locator('.scroller').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(input).toHaveValue('Unsaved draft stays here');
      await input.press('Escape');

      // Search must find a row that was never mounted, without scrolling first.
      await page.getByRole('searchbox').fill('Lazy module 150');
      await expect(page.locator('table.run .name-text')).toHaveText(['Lazy module 150']);
      await page.getByRole('searchbox').fill('');
      await page.reload();
      await expect(page.locator('table.run > tbody > tr.grouphead').first()).toBeAttached();
      await expect.poll(() => bodyRows.count()).toBeGreaterThan(400);
      await page.locator('.tab').filter({ hasText: 'Lazy module 150' }).click();
      const target = page.locator('tr[id^="row-"]').filter({ has: page.locator('.name-text', { hasText: 'Lazy module 150' }) });
      await expect(target).toBeInViewport();
      await expect.poll(() => page.locator('table.run > tbody > tr[data-row-mounted="true"]').count()).toBeLessThan(60);
      await target.locator('td.nm').click();
      await target.locator('td.nm').press('e');
      await expect(page.getByRole('complementary', { name: 'Task detail' })).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Task detail' })).toContainText('Lazy module 150');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fx.client.query('DELETE FROM pmt_defect_nodes WHERE node_project_id=$1', [fx.projectId]);
    await fx.cleanup();
  }
});
