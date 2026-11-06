import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium, type Browser } from '@playwright/test';
import { setup, signIn, BASE_URL, type Fixture } from '../helpers/harness.ts';
import { hashPassword } from '../../src/lib/password.ts';

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
  // Neither Timeline has a create action; the way back to today is the one
  // control every visit uses, so it stands in as the primary.
  {
    name: 'project timeline',
    path: async (fx) => {
      const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
      return `/p/${rows[0].project_slug}/timeline`;
    },
    primary: '.today-jump',
  },
  { name: 'all timeline', path: () => '/timeline', primary: '.today-jump' },
  { name: 'people', path: () => '/people', primary: '.people-add' },
  // No field is dirty on load, so the Save button starts disabled; the
  // always-enabled link beside it is what the keyboard actually reaches.
  { name: 'profile', path: () => '/profile', primary: '.prof-link' },
  {
    name: 'project settings',
    path: async (fx) => {
      const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
      return `/p/${rows[0].project_slug}/settings`;
    },
    // The Rename button starts disabled (its field has not been touched);
    // this one is not.
    primary: '.label.primary',
  },
  {
    name: 'project report',
    path: async (fx) => {
      const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
      return `/p/${rows[0].project_slug}/report`;
    },
    primary: '.report-controls .primary',
  },
];

const cookiesFor = (header: string) => header.split('; ').map((pair) => {
  const at = pair.indexOf('=');
  return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
});

const DEFAULT_PRIMARY = '.sh-btn-primary, .docs-primary';

/**
 * `goto` returns once the document loads, but a streamed route (the List's
 * /p/[slug]) is still showing its Suspense fallback then. Tabbing or measuring
 * at that moment lands on skeleton nodes that are about to be replaced — focus
 * falls back to <body> and scrollWidth measures the skeleton. Wait for the
 * page's own primary control, and for the network to settle, first.
 */
async function settle(page: import('@playwright/test').Page, primary = DEFAULT_PRIMARY): Promise<void> {
  await page.locator(primary).first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
}

async function reachPrimaryByTab(page: import('@playwright/test').Page, primary = DEFAULT_PRIMARY): Promise<boolean> {
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
      await settle(mobilePage, primary);
      const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= 390, `${name}: scrollWidth ${scrollWidth} overflows 390px at mobile width`);
      await mobile.close();

      // Desktop: the header is a white bar (DESIGN.md § 1), and the first
      // primary action is reachable and visibly focused from the keyboard.
      const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await desktop.addCookies(cookiesFor(admin.header));
      const desktopPage = await desktop.newPage();
      await desktopPage.goto(url);
      await settle(desktopPage, primary);

      const headerBg = await desktopPage.evaluate(() => {
        const header = document.querySelector('.sh-work-head, .head, .people-head, .prof-head');
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

/**
 * Deleting a page is danger red, never vermilion and never the tree's quiet
 * grey. The static guard reads declarations; only a browser can see that the
 * generic tree-button rule does not outrank the delete rule.
 */
test('the Docs tree delete button draws in danger', async () => {
  const fx = await setup();
  let browser: Browser | undefined;
  try {
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const post = async (url: string, body: unknown) => {
      const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', headers: { cookie: admin.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      assert.equal(res.status, 200, JSON.stringify(json));
      return json;
    };
    const doc = await post(`/api/projects/${fx.projectId}/docs`, { title: 'Danger check' });
    const page0 = await post(`/api/docs/${doc.id}/pages`, { title: 'หน้าที่จะลบ', template: 'free', content: { body: 'ข้อความ' } });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookiesFor(admin.header));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/p/${rows[0].project_slug}/docs/${page0.slug}`);

    const trash = page.locator('.doc-tree-row > .doc-tree-delete').first();
    await trash.waitFor();
    assert.equal(await trash.isDisabled(), false, 'the delete button is disabled, so its rest colour is not under test');
    const ink = () => trash.evaluate((el) => getComputedStyle(el).color);
    const wash = () => trash.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await ink(), 'rgb(196, 54, 47)', 'the tree delete button is not --color-danger at rest');

    await trash.hover();
    await page.waitForTimeout(200); // the 120ms background transition
    assert.equal(await wash(), 'rgb(251, 236, 235)', 'the tree delete button does not take --color-danger-wash on hover');
    assert.equal(await ink(), 'rgb(165, 44, 38)', 'the tree delete button is not --color-danger-active on hover');

    await context.close();
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});

const INSTALL_EMAIL = 'admin@cit.com';

/**
 * The access board reveals a row's Delete button in a quiet grey on row
 * hover (`.board tbody tr:hover .acct-del`), one class heavier than the
 * button's own `:hover` rule — which used to let the row rule keep winning
 * and leave the button grey while it was actually being hovered, with only
 * its background taking the danger wash. Only a browser computes which rule
 * wins. Gated the same way the install-admin cases in wiki.test.ts are: a
 * throwaway `admin@cit.com` is made when none exists, or the real one is
 * used when its password is supplied; otherwise this case cannot run here.
 */
test('the people Delete button draws in danger on hover, and the confirm dialog fills with it', async (t) => {
  const fx = await setup();
  let browser: Browser | undefined;
  let createdInstallId = '';
  try {
    const { rows } = await fx.client.query(
      'SELECT user_id FROM pmt_users WHERE lower(user_email) = $1', [INSTALL_EMAIL],
    );
    let install: { header: string };
    if (rows.length === 0) {
      const password = randomBytes(18).toString('base64url');
      createdInstallId = randomUUID();
      await fx.client.query(
        `INSERT INTO pmt_users (user_id, user_email, user_full_name, user_password_hash)
         VALUES ($1, $2, 'E2E install', $3)`,
        [createdInstallId, INSTALL_EMAIL, await hashPassword(password)],
      );
      install = await signIn(INSTALL_EMAIL, password);
    } else if (process.env.E2E_INSTALL_ADMIN_PASSWORD) {
      install = await signIn(INSTALL_EMAIL, process.env.E2E_INSTALL_ADMIN_PASSWORD);
    } else {
      // No throwaway possible (the real account already exists on this
      // database) and no password supplied to sign in as it.
      t.skip('existing admin@cit.com and no E2E_INSTALL_ADMIN_PASSWORD to sign in as it');
      return;
    }

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookiesFor(install.header));
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/people`);

    const row = page.getByRole('row').filter({ hasText: fx.admin.email });
    await row.waitFor();
    const del = row.getByRole('button', { name: /^Delete .*account$/ });
    await del.waitFor();
    await row.hover();
    await del.hover();
    await page.waitForTimeout(200); // the 120ms colour transition
    const ink = await del.evaluate((el) => getComputedStyle(el).color);
    const border = await del.evaluate((el) => getComputedStyle(el).borderColor);
    assert.equal(ink, 'rgb(196, 54, 47)', 'the Delete button does not draw --color-danger ink on hover');
    assert.equal(border, 'rgb(196, 54, 47)', 'the Delete button does not draw a --color-danger border on hover');

    await del.click();
    const confirm = page.getByRole('dialog', { name: 'Delete account', exact: true });
    const yes = confirm.getByRole('button', { name: 'Delete', exact: true });
    await yes.waitFor();
    const yesBg = await yes.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(yesBg, 'rgb(196, 54, 47)', 'the armed confirm does not fill with --color-danger');
    // Cancelled rather than confirmed: this test deletes nobody.
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();

    await context.close();
  } finally {
    await browser?.close();
    if (createdInstallId) await fx.client.query('DELETE FROM pmt_users WHERE user_id=$1', [createdInstallId]);
    await fx.cleanup();
  }
});

/**
 * The List's airy rows are 40px, padded 8px 12px, which leaves 23px for the
 * cell's content. An editor taller than that would make the row jump every
 * time a cell opens for editing — so the row must measure the same before
 * and during an edit, for the name and for a date.
 */
test('List rows hold their height while a cell is edited', async () => {
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
    const rename = page.getByRole('button', { name: 'Rename Task', exact: true });
    if (!(await rename.count())) {
      await page.locator('.twist:not(.leaf)[aria-expanded="false"]').first().click();
    }
    const row = page.locator(`tr#row-${fx.nodes.task}`);
    await row.waitFor();
    const height = () => row.evaluate((tr) => tr.getBoundingClientRect().height);

    const before = await height();
    assert.ok(before >= 36 && before <= 41, `a task row is ${before}px, not an airy 36–40px row`);

    await row.hover();
    await rename.click();
    await row.locator('input.cell-input').waitFor();
    assert.equal(await height(), before, 'the row grew when its name opened for editing');
    await page.keyboard.press('Escape');
    await row.locator('input.cell-input').waitFor({ state: 'detached' });

    await row.hover();
    await row.getByRole('button', { name: 'Edit Estimate Start for Task', exact: true }).click();
    await row.locator('td.editing').waitFor();
    assert.equal(await height(), before, 'the row grew when a date opened for editing');
    await page.keyboard.press('Escape');

    await context.close();
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
