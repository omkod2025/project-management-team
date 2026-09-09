import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('document editor creates, formats, autosaves, reloads and handles conflicts', async () => {
  const fx = await setup();
  let browser;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const post = async (url: string, body: unknown) => {
      const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', headers: { cookie: jar.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(res.status, 200); return res.json();
    };
    const doc = await post(`/api/projects/${fx.projectId}/docs`, { title: 'Editor browser check' });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    const slug = rows[0].project_slug;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(jar.header.split('; ').map((pair) => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`${BASE_URL}/p/${slug}/docs?doc=${doc.id}`);
    await page.getByRole('button', { name: '+ New page', exact: true }).click();
    await page.getByLabel('Page title', { exact: true }).fill('รายละเอียดโครงการ');
    await page.getByRole('button', { name: 'Create page', exact: true }).click();
    await page.waitForURL(/\/docs\/page-/);
    const content = page.getByRole('textbox', { name: 'Content', exact: true });
    await content.waitFor();
    await content.fill('/h2');
    await page.getByRole('region', { name: 'Insert block', exact: true }).waitFor();
    await content.press('Enter');
    await content.pressSequentially('Slash heading');
    await page.locator('.tiptap h2').filter({ hasText: 'Slash heading' }).waitFor();
    await content.press('Enter');
    await content.fill('ภาษาไทย — Scope and decisions');
    await content.press('Control+a');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await page.getByRole('button', { name: 'More formatting', exact: true }).click();
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.locator('.doc-toolbar-top').waitFor();
    await page.getByRole('button', { name: 'Page Styles', exact: true }).click();
    await page.getByRole('complementary', { name: 'Page Styles', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close page panel', exact: true }).click();
    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
    await page.reload();
    await page.locator('article strong').filter({ hasText: 'ภาษาไทย' }).waitFor();
    await page.screenshot({ path: 'data/doc-editor-read.png', fullPage: true });
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    await content.waitFor();
    await page.screenshot({ path: 'data/doc-editor-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'data/doc-editor-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const pageSlug = new URL(page.url()).pathname.split('/').at(-1);
    const record = (await fx.client.query('SELECT doc_page_id FROM pmt_doc_pages WHERE doc_page_slug = $1', [pageSlug])).rows[0];
    await fx.client.query("UPDATE pmt_doc_pages SET doc_page_updated_at = doc_page_updated_at + interval '1 second' WHERE doc_page_id = $1", [record.doc_page_id]);
    await content.fill('My unsaved draft');
    await page.getByRole('button', { name: 'Show my draft', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show my draft', exact: true }).click();
    assert.match(await page.locator('.editor-copy textarea').inputValue(), /My unsaved draft/);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await fx.cleanup(); }
});
