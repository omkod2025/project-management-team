import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser } from '@playwright/test';
import { setup, signIn, BASE_URL, type Fixture } from '../helpers/harness.ts';

/**
 * Browser checks for the Notion house style (DESIGN.md), across the pages the
 * restyle touches. Each task appends its own entries to `PAGES` rather than
 * adding a new file, so the same three checks — no horizontal overflow on a
 * phone, a white header on desktop, a visible keyboard focus ring on the
 * primary action — run against every migrated screen without this file
 * needing to know which task added which page.
 */
export const PAGES: Array<{
  name: string;
  path: (fx: Fixture) => string | Promise<string>;
  /** The page's primary action, when it is not the house's shared class. */
  primary?: string;
}> = [
  { name: 'shelf', path: () => '/' },
  {
    name: 'list',
    path: async (fx) => {
      const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
      return `/p/${rows[0].project_slug}`;
    },
    primary: '.toolbar-add',
  },
];

const cookiesFor = (header: string) => header.split('; ').map((pair) => {
  const at = pair.indexOf('=');
  return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
});

async function reachPrimaryByTab(page: import('@playwright/test').Page, primary = '.sh-btn-primary, .docs-primary'): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const onPrimary = await page.evaluate((selector) => {
      const el = document.activeElement;
      return !!el && el.matches(selector);
    }, primary);
    if (onPrimary) return true;
  }
  return false;
}

test('shell, shelf and bell hold the house style', async () => {
  const fx = await setup();
  let browser: Browser | undefined;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    for (const { name, path, primary } of PAGES) {
      const url = `${BASE_URL}${await path(fx)}`;

      // Mobile: nothing forces the page wider than the viewport.
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await mobile.addCookies(cookiesFor(admin.header));
      const mobilePage = await mobile.newPage();
      await mobilePage.goto(url);
      const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `${name}: scrollWidth ${scrollWidth} overflows 390px at mobile width`);
      await mobile.close();

      // Desktop: the header is a white bar (DESIGN.md § 1), and the first
      // primary action is reachable and visibly focused from the keyboard.
      const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await desktop.addCookies(cookiesFor(admin.header));
      const desktopPage = await desktop.newPage();
      await desktopPage.goto(url);

      const headerBg = await desktopPage.evaluate(() => {
        const header = document.querySelector('.sh-work-head, .head');
        return header ? getComputedStyle(header).backgroundColor : null;
      });
      assert.equal(headerBg, 'rgb(255, 255, 255)', `${name}: header background is not white`);

      const reached = await reachPrimaryByTab(desktopPage, primary);
      assert.ok(reached, `${name}: Tab never reached the primary button`);
      const outlineStyle = await desktopPage.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
      assert.equal(outlineStyle, 'solid', `${name}: the focused primary button has no visible focus ring`);

      await desktop.close();
    }
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
