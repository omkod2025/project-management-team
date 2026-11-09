/**
 * The Tokens / MCP page in a real browser (central MCP tokens design, the
 * stepper): choose modules, then what each may do, then where, then a name.
 *
 * Signed in as the fixture's project admin with one project and one wiki, it
 * makes a token across all three modules, checks that Read is a ticked box
 * nobody can untick, that Select all counts what it chose, and that the
 * secret is shown exactly once. Then it edits the token to drop the Wiki and
 * checks the wiki leaves the row with it. The old `/wiki/tokens` address
 * redirects here, and the page holds at a phone's width.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { setup, signIn, BASE_URL, type Jar } from '../helpers/harness.ts';
import { datePicker, pickDate } from '../helpers/date-picker.ts';

const LABEL = 'แล็ปท็อปที่ทำงาน';
const WIKI_TITLE = 'คู่มือโทเค็น';

async function contextFor(browser: Browser, jar: Jar, width = 1440): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addCookies(jar.header.split('; ').map((pair) => {
    const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
  }));
  return context;
}

test('Tokens / MCP: make a token across three modules, edit one away, and the old address redirects', async () => {
  const fx = await setup();
  let browser: Browser | undefined;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const made = await fetch(`${BASE_URL}/api/wikis`, {
      method: 'POST', headers: { cookie: jar.header, 'content-type': 'application/json' },
      body: JSON.stringify({ title: WIKI_TITLE }),
    });
    assert.equal(made.status, 200);

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await contextFor(browser, jar);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = []; page.on('pageerror', (err) => errors.push(err.message));

    // Reachable from the Projects home page's rail, not only the cross-place
    // header and the Wiki menu.
    await page.goto(`${BASE_URL}/`);
    await page.getByRole('link', { name: 'Tokens / MCP', exact: true }).waitFor();

    // The old address is a redirect now.
    await page.goto(`${BASE_URL}/wiki/tokens`);
    await page.waitForURL(`${BASE_URL}/tokens`);

    // Making a token is a page of its own, with no token tables on it.
    await page.getByRole('link', { name: 'Make a token', exact: true }).click();
    await page.waitForURL(`${BASE_URL}/tokens/new`);
    const stepper = page.getByRole('form', { name: 'New token' });
    await stepper.waitFor();
    assert.equal(await page.getByRole('table').count(), 0, 'the new-token page still shows a token table');

    // 1. Modules: Next waits for a choice.
    const next = stepper.getByRole('button', { name: 'Next', exact: true });
    assert.equal(await next.isDisabled(), true);
    for (const name of ['List', 'Docs', 'Wiki']) await stepper.getByRole('checkbox', { name, exact: true }).check();
    await next.click();

    // 2. Permissions: one group per module, Read ticked and locked.
    const group = (name: string) => stepper.getByRole('group', { name, exact: true });
    for (const name of ['List', 'Docs', 'Wiki']) {
      const read = group(name).getByRole('checkbox', { name: 'Read', exact: true });
      assert.equal(await read.isChecked() && await read.isDisabled(), true, `${name}: Read is not ticked and locked`);
    }

    // Select all, both forms. It controls Create and Write only (2 + 3 + 3 here),
    // and follows the boxes: part-ticked is indeterminate, all ticked is checked.
    const everyAll = stepper.locator('.tk-all-global').getByRole('checkbox', { name: 'Select all', exact: true });
    const moduleAll = (name: string) => group(name).getByRole('checkbox', { name: 'Select all', exact: true });
    const state = async (box: typeof everyAll) =>
      box.evaluate((el: HTMLInputElement) => (el.indeterminate ? 'some' : el.checked ? 'all' : 'none'));
    const box = (mod: string, name: string) => group(mod).getByRole('checkbox', { name, exact: true });
    await stepper.getByText('0 of 8 selected', { exact: true }).waitFor();
    assert.equal(await state(everyAll), 'none');

    await box('List', 'Write').check();
    assert.equal(await state(moduleAll('List')), 'some', 'List: one of two is not indeterminate');
    assert.equal(await state(everyAll), 'some', 'one of eight is not indeterminate');
    await box('List', 'Create task').check();
    assert.equal(await state(moduleAll('List')), 'all', 'List: ticking both one by one does not check its Select all');

    await moduleAll('Docs').check();
    for (const name of ['Create doc', 'Create page', 'Write']) assert.equal(await box('Docs', name).isChecked(), true, `Docs: ${name}`);
    await group('Docs').getByText('3 of 3 selected', { exact: true }).waitFor();
    assert.equal(await state(moduleAll('Wiki')), 'none');

    await everyAll.check();
    await stepper.locator('.tk-all-global').getByText('8 of 8 selected', { exact: true }).waitFor();
    for (const name of ['List', 'Docs', 'Wiki']) assert.equal(await state(moduleAll(name)), 'all', `${name}: global Select all missed it`);
    assert.equal(await box('Wiki', 'Read').isChecked(), true, 'Read came unticked');
    await everyAll.uncheck();
    assert.equal(await box('Wiki', 'Create wiki').isChecked(), false);
    assert.equal(await box('Wiki', 'Read').isChecked(), true, 'Select all unticked Read');

    await box('List', 'Write').check();
    await box('Wiki', 'Create page').check();
    await next.click();

    // 3. Where: Select all chooses every listed project and counts it.
    const projects = stepper.getByRole('group', { name: /^Projects/ });
    await projects.getByRole('checkbox', { name: 'Select all', exact: true }).check();
    await projects.getByText('1 of 1 selected', { exact: true }).waitFor();
    await stepper.getByRole('group', { name: /^Wikis/ }).getByRole('checkbox', { name: 'Select all', exact: true }).check();

    // The phone width holds with the widest step open.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the stepper scrolls sideways at 390px');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await next.click();

    // 4. Name and confirm.
    await stepper.getByLabel('Label', { exact: true }).fill(LABEL);
    // Expiry is the end of the chosen day in Bangkok: 23:59:59+07:00.
    const expiry = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    await pickDate(page, expiry, datePicker(stepper, 'Expires'));
    await stepper.getByRole('button', { name: 'Create token', exact: true }).click();

    await page.getByRole('heading', { name: 'Copy your token now' }).waitFor();
    const secret = (await page.locator('.tk-snippet code').first().innerText()).trim();
    assert.match(secret, /^pmw_[A-Za-z0-9_-]{43}$/);
    const config = await page.locator('.tk-snippet code').nth(1).innerText();
    assert.match(config, /"t-timeline"/);
    assert.match(await page.locator('.tk-snippet code').nth(2).innerText(), /^claude mcp add --transport http t-timeline /);
    assert.ok(config.includes(secret));
    await page.getByRole('button', { name: 'Done, I have copied it' }).click();
    await page.waitForURL(`${BASE_URL}/tokens`);
    assert.equal((await page.content()).includes(secret), false, 'the secret is still on the page after Done');
    await page.reload();
    assert.equal((await page.content()).includes(secret), false, 'the secret came back on reload');

    const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: LABEL, exact: true }) });
    await row.waitFor();
    const text = await row.innerText();
    for (const word of ['List', 'Docs', 'Wiki', WIKI_TITLE]) assert.ok(text.includes(word), `the row does not show ${word}`);
    // The table has its own Expired column, with the end of the chosen Bangkok day.
    assert.equal(await row.locator('td[data-label="Expired"] time').getAttribute('datetime'), `${expiry}T16:59:59.000Z`);

    // Edit opens its own page prefilled at step 1; dropping the Wiki drops its scope.
    await row.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.waitForURL(/\/tokens\/[0-9a-f-]{36}\/edit$/);
    const edit = page.getByRole('form', { name: `Edit ${LABEL}` });
    await edit.waitFor();
    assert.equal(await page.getByRole('table').count(), 0, 'the edit page still shows a token table');
    assert.equal(await edit.getByRole('checkbox', { name: 'Wiki', exact: true }).isChecked(), true);
    await edit.getByRole('checkbox', { name: 'Wiki', exact: true }).uncheck();
    const editNext = edit.getByRole('button', { name: 'Next', exact: true });
    await editNext.click();
    assert.equal(await edit.getByRole('group', { name: 'List', exact: true }).getByRole('checkbox', { name: 'Write', exact: true }).isChecked(), true);
    await editNext.click();
    assert.equal(await edit.getByRole('group', { name: /^Wikis/ }).count(), 0, 'Where still offers wikis without the Wiki module');
    await editNext.click();
    // Step 4 shows the expiry it was made with, and it cannot be changed.
    const shown = datePicker(edit, 'Expires');
    assert.equal(await shown.getAttribute('data-value'), expiry);
    assert.equal(await shown.isDisabled(), true, 'the expiry can be edited');
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(`${BASE_URL}/tokens`);
    await row.getByRole('cell').filter({ hasText: 'List' }).first().waitFor();
    await page.waitForFunction((title) => {
      const cells = [...document.querySelectorAll('tr')].find((tr) => tr.textContent?.includes('แล็ปท็อปที่ทำงาน'));
      return !!cells && !cells.textContent?.includes(title);
    }, WIKI_TITLE);
    assert.equal((await row.innerText()).includes(WIKI_TITLE), false, 'the row still lists the wiki');

    const api = await fetch(`${BASE_URL}/api/tokens`, { headers: { cookie: jar.header } });
    const mine = (await api.json()) as Array<{ label: string; grants: Record<string, string[]>; projects: unknown[]; wikis: unknown[]; expiresAt: string | null }>;
    const saved = mine.find((t) => t.label === LABEL)!;
    assert.equal(saved.expiresAt, `${expiry}T16:59:59.000Z`, 'the expiry is not the end of the chosen Bangkok day');
    assert.deepEqual(saved.grants, { list: ['write_task'], docs: [] });
    assert.equal(saved.projects.length, 1);
    assert.equal(saved.wikis.length, 0);

    // The table holds at a phone's width too.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the token page scrolls sideways at 390px');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fx.client.query('DELETE FROM pmt_access_tokens WHERE access_token_owner_id = $1', [fx.admin.id]).catch(() => undefined);
    await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_owner_id = $1', [fx.admin.id]);
    await fx.cleanup();
  }
});
