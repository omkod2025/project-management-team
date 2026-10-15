import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

test('document images open a responsive modal and restore keyboard focus', async () => {
  const fx = await setup();
  let browser;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const api = async (url: string, method: string, body: unknown) => {
      const response = await fetch(`${BASE_URL}${url}`, { method, headers: { cookie: jar.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const doc = await api(`/api/projects/${fx.projectId}/docs`, 'POST', { title: 'Image preview check' });
    const record = await api(`/api/docs/${doc.id}/pages`, 'POST', { title: 'Image preview', template: 'free' });
    await api(`/api/doc-pages/${record.id}`, 'PATCH', { updatedAt: record.updatedAt, content: { body: '![Wide diagram](/preview-fixture.svg)' } });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    await context.addCookies(jar.header.split('; ').map(pair => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    await page.route('**/preview-fixture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1000"><rect width="1800" height="1000" fill="#eef0fa"/><text x="120" y="160" font-size="70" fill="#2b3a8f">Image preview fixture</text></svg>' }));
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}/docs/${record.slug}`);
    const trigger = page.getByRole('button', { name: 'Enlarge image: Wide diagram', exact: true });
    const modal = page.getByRole('dialog', { name: 'Image preview', exact: true });
    for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button', { name: 'Close image preview' })).toBeFocused();
      await expect(modal.getByRole('img')).toBeVisible();
      const box = await modal.getByRole('img').boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
      await page.screenshot({ path: `data/doc-image-${label}.png` });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.ok(await modal.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await modal.getByRole('button', { name: 'Close image preview' }).click();
      await expect(trigger).toBeFocused();
      await trigger.press('Space');
      await modal.click({ position: { x: 2, y: 2 } });
      await expect(modal).toHaveCount(0);
    }
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
