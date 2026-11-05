import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';

/**
 * Pins the Calendar's own computed look before the Notion restyle touches
 * every other screen. The Calendar itself is explicitly out of scope for the
 * restyle, so this fixture must read the same after every later task.
 *
 * The month is fixed to the seeded task's October 2026 dates (never "today"),
 * so a rerun on a different day produces the same numbers.
 */

const fixturePath = fileURLToPath(new URL('./fixtures/calendar-look.json', import.meta.url));

const PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'color', 'backgroundColor',
  'borderTopLeftRadius', 'borderTopColor', 'boxShadow', 'paddingTop', 'paddingLeft',
] as const;

/** Name -> selector. The first match of each selector is fingerprinted. */
const PARTS: Record<string, string> = {
  page: '.cal-page',
  header: '.cal-header',
  heading: '.cal-heading h1',
  projectNavLink: '.cal-project-nav a',
  sidebar: '.cal-sidebar',
  dayCell: '.cal-day',
  estimateBar: '.cal-bars button[data-kind="estimate"]',
  actualBar: '.cal-bars button[data-kind="actual"]',
};

type Snapshot = Record<string, Record<string, string> | null>;

async function fingerprint(page: Page): Promise<Snapshot> {
  return page.evaluate(({ parts, props }) => {
    const out: Record<string, Record<string, string> | null> = {};
    for (const [key, selector] of Object.entries(parts)) {
      const el = document.querySelector(selector);
      if (!el) { out[key] = null; continue; }
      const computed = getComputedStyle(el);
      const style: Record<string, string> = {};
      for (const prop of props) style[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
      out[key] = style;
    }
    return out;
  }, { parts: PARTS, props: PROPS });
}

async function openCalendar(page: Page, url: string) {
  await page.goto(url);
  const modal = page.getByRole('dialog', { name: 'Task details' });
  if (await modal.isVisible().catch(() => false)) {
    await modal.getByRole('button', { name: 'Close task details' }).click();
  }
  // The estimate/actual bars render after client hydration fetches the
  // ledger; wait for both so the fingerprint never races the first paint.
  await page.waitForSelector('.cal-bars button[data-kind="actual"]');
}

test("Calendar's own look is pinned before the restyle", async () => {
  const fx = await setup();
  let browser;
  try {
    await fx.client.query(
      `UPDATE pmt_nodes SET node_name='Calendar look task', node_estimate_start='2026-10-12', node_estimate_end='2026-10-14', node_actual_start='2026-10-15', node_actual_end='2026-10-16' WHERE node_id=$1`,
      [fx.nodes.task],
    );
    const result = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id=$1', [fx.projectId]);
    const slug = result.rows[0].project_slug;
    const admin = await signIn(fx.admin.email, fx.admin.password);
    const url = `${BASE_URL}/p/${slug}/calendar?node=${fx.nodes.task}`;

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const cookies = (header: string) => header.split('; ').map(pair => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    });

    const actual: Record<string, Snapshot> = {};

    for (const [sizeKey, viewport] of Object.entries({
      desktop: { width: 1440, height: 1000 },
      mobile: { width: 390, height: 844 },
    })) {
      const context = await browser.newContext({ viewport });
      await context.addCookies(cookies(admin.header));
      const page = await context.newPage();

      await openCalendar(page, url);
      actual[`${sizeKey}.month`] = await fingerprint(page);

      await page.getByLabel('Calendar view', { exact: true }).selectOption('week');
      await page.waitForSelector('.cal-bars button[data-kind="actual"]');
      actual[`${sizeKey}.week`] = await fingerprint(page);

      await context.close();
    }

    if (process.env.UPDATE_CALENDAR_LOOK === '1') {
      writeFileSync(fixturePath, JSON.stringify(actual, null, 2) + '\n');
      return;
    }

    const expected = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.deepEqual(actual, expected);
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
