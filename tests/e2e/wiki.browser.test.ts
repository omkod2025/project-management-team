/**
 * The Wiki screens in a real browser (wiki spec §4, §5).
 *
 * The owner makes a wiki from the Wiki menu, writes a Thai page with a
 * Mermaid block and sees the preview draw; a read member gets the same page
 * drawn and no way to change it; a stranger gets the 404 page; and a `.md`
 * file with a mermaid fence imports as a page whose read view draws an SVG.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { setup, signIn, makeUser, BASE_URL, type Jar } from '../helpers/harness.ts';
import { mermaidSources } from '../../src/lib/mermaid-rules.ts';
import { contentMarkdown } from '../../src/lib/doc-rich-content.ts';

const WIKI_TITLE = 'คู่มือทีมติดตั้ง';
const PAGE_TITLE = 'การติดตั้งกล้อง';
const THAI = 'ขั้นตอนการติดตั้งกล้องวงจรปิด';
const MERMAID_LINES = ['flowchart LR', 'A["กล้อง"] --> B[NVR]'];

async function contextFor(browser: Browser, jar: Jar): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(jar.header.split('; ').map((pair) => {
    const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
  }));
  return context;
}

test('Wiki screens: create, write Thai and Mermaid, read-only member, stranger 404, .md import', async () => {
  const fx = await setup();
  let browser: Browser | undefined;
  let wikiId = '';
  try {
    const owner = await makeUser(fx.client, 'wiki-owner');
    const reader = await makeUser(fx.client, 'wiki-reader');
    const stranger = await makeUser(fx.client, 'wiki-stranger');
    const [ownerJar, readerJar, strangerJar] = await Promise.all([
      signIn(owner.email, owner.password), signIn(reader.email, reader.password), signIn(stranger.email, stranger.password),
    ]);

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ownerContext = await contextFor(browser, ownerJar);
    const page = await ownerContext.newPage();
    const errors: string[] = []; page.on('pageerror', (err) => errors.push(err.message));

    // The Wiki menu: Create wiki at the top right opens the form in a modal.
    await page.goto(`${BASE_URL}/wiki`);
    await page.getByRole('heading', { name: 'Wiki', exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Create wiki', exact: true }).click();
    const newWiki = page.getByRole('dialog', { name: 'New wiki' });
    await newWiki.waitFor();
    await newWiki.getByLabel('Wiki title', { exact: true }).fill(WIKI_TITLE);
    await newWiki.getByLabel(/^Description/).fill('ความรู้สำหรับทีมหน้างาน');
    await newWiki.getByRole('button', { name: 'Create wiki', exact: true }).click();
    await page.waitForURL(/\/wiki\/[0-9a-f-]{36}$/);
    wikiId = /\/wiki\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    await page.getByText('No pages yet.').first().waitFor();

    // A new page opens in the editor.
    await page.getByRole('button', { name: 'New page', exact: true }).click();
    await page.waitForURL(/\/wiki\/[0-9a-f-]{36}\/page-[a-z0-9]+\?edit=1$/);
    const title = page.getByRole('textbox', { name: 'Page title', exact: true });
    await title.waitFor();
    await title.fill(PAGE_TITLE);
    const content = page.getByRole('textbox', { name: 'Content', exact: true });
    await content.click();
    await page.keyboard.type(THAI);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/mermaid');
    await page.getByRole('region', { name: 'Insert block', exact: true }).waitFor();
    await page.keyboard.press('Enter');
    await page.locator('[data-mermaid-node-view] code').first().waitFor();
    await page.keyboard.type(MERMAID_LINES[0]!);
    await page.keyboard.press('Enter');
    await page.keyboard.type(MERMAID_LINES[1]!);
    // The live preview draws while the author types.
    await page.locator('[data-mermaid-node-view] .doc-mermaid svg').waitFor();

    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
    await page.locator('article .doc-mermaid svg').waitFor();

    const saved = await fx.client.query(
      'SELECT wiki_page_title, wiki_page_body, wiki_page_slug FROM pmt_wiki_pages WHERE wiki_page_wiki_id = $1', [wikiId],
    );
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0].wiki_page_title, PAGE_TITLE);
    const body = saved.rows[0].wiki_page_body as string;
    assert.ok(contentMarkdown(body).includes(THAI), 'the Thai paragraph was saved');
    assert.deepEqual(mermaidSources(body), [MERMAID_LINES.join('\n')]);
    const slug = saved.rows[0].wiki_page_slug as string;

    // A read member: the page draws, and nothing on it can change it.
    const grant = await fetch(`${BASE_URL}/api/wikis/${wikiId}/members`, {
      method: 'PUT', headers: { cookie: ownerJar.header, 'content-type': 'application/json' },
      body: JSON.stringify({ userId: reader.id, access: 'read' }),
    });
    assert.equal(grant.status, 200);
    const readerContext = await contextFor(browser, readerJar);
    const readerPage = await readerContext.newPage();
    readerPage.on('pageerror', (err) => errors.push(err.message));
    await readerPage.goto(`${BASE_URL}/wiki/${wikiId}/${slug}`);
    await readerPage.locator('article .doc-mermaid svg').waitFor();
    await readerPage.getByText(THAI).waitFor();
    assert.equal(await readerPage.getByRole('button', { name: 'Edit page' }).count(), 0);
    assert.equal(await readerPage.getByRole('button', { name: 'New page' }).count(), 0);
    assert.equal(await readerPage.getByRole('button', { name: /^Page actions/ }).count(), 0);
    assert.equal(await readerPage.getByLabel('Import document file').count(), 0);
    // `?edit=1` does not open an editor for a reader either.
    await readerPage.goto(`${BASE_URL}/wiki/${wikiId}/${slug}?edit=1`);
    await readerPage.locator('article .doc-mermaid svg').waitFor();
    assert.equal(await readerPage.getByRole('textbox', { name: 'Content' }).count(), 0);
    // The wiki is on the reader's menu; settings are not offered.
    await readerPage.goto(`${BASE_URL}/wiki`);
    await readerPage.getByRole('link', { name: WIKI_TITLE }).waitFor();
    await readerPage.goto(`${BASE_URL}/wiki/${wikiId}`);
    assert.equal(await readerPage.getByRole('link', { name: 'Settings' }).count(), 0);

    // A stranger: the wiki, its page and its settings are the 404 page.
    const strangerContext = await contextFor(browser, strangerJar);
    const strangerPage = await strangerContext.newPage();
    for (const url of [`/wiki/${wikiId}`, `/wiki/${wikiId}/${slug}`, `/wiki/${wikiId}/settings`]) {
      const res = await strangerPage.goto(`${BASE_URL}${url}`);
      assert.equal(res?.status(), 404, url);
    }
    await strangerPage.goto(`${BASE_URL}/wiki`);
    assert.equal(await strangerPage.getByRole('link', { name: WIKI_TITLE }).count(), 0);

    // Import: a Markdown file with a mermaid fence becomes a page that draws.
    const mdPath = path.join(tmpdir(), `wiki-import-${Date.now()}.md`);
    await writeFile(mdPath, ['# นำเข้า', '', 'ข้อความภาษาไทย', '', '```mermaid', 'flowchart TD', '  X["เริ่ม"] --> Y[จบ]', '```', ''].join('\n'));
    await page.getByText('Export & Import', { exact: true }).click();
    await page.getByLabel('Import document file', { exact: true }).setInputFiles(mdPath);
    await page.getByRole('status').filter({ hasText: 'Imported 1 page(s)' }).waitFor();
    const imported = await fx.client.query(
      'SELECT wiki_page_slug FROM pmt_wiki_pages WHERE wiki_page_wiki_id = $1 AND wiki_page_slug <> $2', [wikiId, slug],
    );
    assert.equal(imported.rows.length, 1);
    await page.goto(`${BASE_URL}/wiki/${wikiId}/${imported.rows[0].wiki_page_slug}`);
    await page.locator('article .doc-mermaid').filter({ hasText: 'เริ่ม' }).locator('svg').waitFor();

    // Whole-wiki export reads in tree order. A child added under the first
    // page after the import sorts last in storage, yet exports right after
    // its parent and before the imported page.
    const parentRow = await fx.client.query('SELECT wiki_page_id FROM pmt_wiki_pages WHERE wiki_page_wiki_id = $1 AND wiki_page_slug = $2', [wikiId, slug]);
    const child = await fetch(`${BASE_URL}/api/wikis/${wikiId}/pages`, {
      method: 'POST', headers: { cookie: ownerJar.header, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'หน้าลูกของการติดตั้ง', parentId: parentRow.rows[0].wiki_page_id }),
    });
    assert.equal(child.status, 200);
    await page.getByText('Export & Import', { exact: true }).click();
    await page.getByLabel(/^Export scope/).selectOption('wiki');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Markdown', exact: true }).click(),
    ]);
    const exportPath = path.join(tmpdir(), `wiki-export-${Date.now()}.md`);
    await download.saveAs(exportPath);
    const exported = await readFile(exportPath, 'utf8');
    const at = [PAGE_TITLE, 'หน้าลูกของการติดตั้ง', 'ข้อความภาษาไทย'].map((s) => exported.indexOf(s));
    assert.ok(at.every((i) => i >= 0), `every page is in the export: ${at}`);
    assert.ok(at[0]! < at[1]! && at[1]! < at[2]!, `pages export in tree order: ${at}`);

    // Phone width: the workspace does not scroll sideways.
    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `page scrolls horizontally by ${overflow}px at phone width`);

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (wikiId) await fx.client.query('DELETE FROM pmt_wikis WHERE wiki_id = $1', [wikiId]);
    else await fx.client.query("DELETE FROM pmt_wikis WHERE wiki_title = $1", [WIKI_TITLE]);
    await fx.cleanup();
  }
});
