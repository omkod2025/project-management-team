import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('in-page outline navigates H1/H2 on desktop and mobile and follows editor changes', async () => {
  const fx = await setup();
  let browser;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const api = async (url: string, method: string, body: unknown) => {
      const res = await fetch(`${BASE_URL}${url}`, { method, headers: { cookie: jar.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(res.status, 200, await res.clone().text());
      return res.json();
    };
    const doc = await api(`/api/projects/${fx.projectId}/docs`, 'POST', { title: 'Outline browser check' });
    const record = await api(`/api/docs/${doc.id}/pages`, 'POST', { title: 'Document title', template: 'free' });
    const filler = Array.from({ length: 16 }, (_, i) => `Paragraph ${i + 1}: รายละเอียดของโครงการและการทำงาน`).join('\n\n');
    await api(`/api/doc-pages/${record.id}`, 'PATCH', { updatedAt: record.updatedAt, content: { body: `# ภาพรวม\n\n${filler}\n\n## รายละเอียด\n\n${filler}\n\n### Not in outline\n\n## รายละเอียด\n\n${filler}` } });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addCookies(jar.header.split('; ').map(pair => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}/docs/${record.slug}`);
    const outline = page.getByRole('navigation', { name: 'On this page', exact: true });
    await expect(outline.getByRole('button')).toHaveText(['ภาพรวม', 'รายละเอียด', 'รายละเอียด']);
    await expect(page.locator('.doc-reading > .doc-page-outline')).toBeVisible();
    await expect(page.locator('.doc-sidebar .doc-page-outline')).toHaveCount(0);
    await page.screenshot({ path: 'data/doc-outline-desktop.png' });
    const outlineBefore = await outline.boundingBox();
    const secondHeading = page.locator('article h2').nth(1);
    await outline.getByRole('button', { name: 'รายละเอียด', exact: true }).nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(secondHeading).toBeFocused();
    await expect.poll(() => page.locator('.doc-reading-body').evaluate(el => el.scrollTop)).toBeGreaterThan(400);
    assert.deepEqual(await outline.boundingBox(), outlineBefore);
    await page.screenshot({ path: 'data/doc-outline-pinned-desktop.png' });
    const box = await secondHeading.boundingBox();
    assert.ok(box && box.y > 0 && box.y < 350);
    await page.setViewportSize({ width: 390, height: 844 });
    await outline.scrollIntoViewIfNeeded();
    await expect(outline).toBeVisible();
    await page.screenshot({ path: 'data/doc-outline-mobile.png' });
    const mobileOutlineBefore = await outline.boundingBox();
    await outline.getByRole('button', { name: 'ภาพรวม', exact: true }).click();
    await expect(page.locator('#doc-page-index')).toBeHidden();
    await expect(page.locator('article h1')).toBeFocused();
    assert.deepEqual(await outline.boundingBox(), mobileOutlineBefore);
    const mobileBox = await page.locator('article h1').boundingBox();
    const mobileReadingBox = await page.locator('.doc-reading-body').boundingBox();
    assert.ok(mobileBox && mobileReadingBox && mobileBox.y >= mobileReadingBox.y && mobileBox.y < mobileReadingBox.y + 150);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Content', exact: true });
    await expect(editor).toBeVisible();
    await expect(outline.getByRole('button')).toHaveCount(3);
    await editor.locator('h2').first().fill('Updated heading');
    await expect(outline.getByRole('button', { name: 'Updated heading', exact: true })).toBeVisible();
    await outline.getByRole('button', { name: 'รายละเอียด', exact: true }).click();
    await expect(editor).toBeFocused();
    await expect.poll(() => editor.locator('h2').nth(1).evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(350);
    await editor.press('Control+a');
    await editor.press('Backspace');
    await expect(outline.getByRole('button')).toHaveCount(0);
    await expect(outline).toContainText('H1 and H2 headings appear here.');
    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit page', exact: true })).toBeVisible();
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
