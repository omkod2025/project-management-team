import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { setup, signIn, BASE_URL } from '../helpers/harness.ts';
import { mermaidSources } from '../../src/lib/mermaid-rules.ts';
import { decodeRich, type RichNode } from '../../src/lib/doc-rich-content.ts';

const VALID = 'flowchart LR\n  A["กล้อง"] --> B[NVR]';
const INVALID = 'flowchart LR\n A-->';
const MALICIOUS = 'graph TD; A["<img src=x onerror=alert(1)>"]-->B; click A "javascript:alert(2)"';
// A diagram trying to take back the settings MERMAID_CONFIG locks.
const DIRECTIVE = '%%{init: {"theme":"dark","themeCSS":"svg{position:fixed}","htmlLabels":true}}%%\nflowchart LR\n  X["ทดสอบ"] --> Y';

const BODY = [
  'Valid diagram:',
  '```mermaid',
  VALID,
  '```',
  '',
  'Invalid diagram:',
  '```mermaid',
  INVALID,
  '```',
  '',
  'Hostile diagram:',
  '```mermaid',
  MALICIOUS,
  '```',
  '',
  'Directive diagram:',
  '```mermaid',
  DIRECTIVE,
  '```',
].join('\n');

test('Mermaid blocks render in read mode, survive publishing, and round-trip through the editor', async () => {
  const fx = await setup();
  let browser;
  try {
    const jar = await signIn(fx.admin.email, fx.admin.password);
    const post = async (url: string, body: unknown) => {
      const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', headers: { cookie: jar.header, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      assert.equal(res.status, 200, JSON.stringify(json));
      return json;
    };
    const doc = await post(`/api/projects/${fx.projectId}/docs`, { title: 'Mermaid browser check' });
    const { rows } = await fx.client.query('SELECT project_slug FROM pmt_projects WHERE project_id = $1', [fx.projectId]);
    const slug = rows[0].project_slug;
    const page0 = await post(`/api/docs/${doc.id}/pages`, { title: 'Mermaid page', template: 'free', content: { body: BODY } });

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(jar.header.split('; ').map((pair) => {
      const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: BASE_URL };
    }));
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', (err) => errors.push(err.message));
    const dialogs: string[] = []; page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });

    await page.goto(`${BASE_URL}/p/${slug}/docs/${page0.slug}`);

    // The valid block renders one SVG carrying the Thai label text.
    const validDiagram = page.locator('.doc-mermaid').filter({ hasText: 'กล้อง' });
    await validDiagram.locator('svg').waitFor();
    assert.equal(await validDiagram.locator('svg').count(), 1);

    // The invalid block keeps showing its source. Mermaid's parse error is for
    // the editor only (spec §3c): a reader sees the source and nothing else.
    const failed = page.locator('[data-mermaid-state="failed"]');
    await failed.waitFor();
    assert.equal(await failed.count(), 1);
    assert.equal(await failed.locator('.doc-mermaid-source').count(), 1);
    assert.equal(await page.locator('.doc-mermaid-error').count(), 0);

    // An init directive cannot take back the locked settings: the house
    // paper fill stays, no HTML label, and no injected themeCSS.
    // Found by position, not label: an HTML label would be stripped by the
    // sanitizer, taking the text with it.
    const directive = page.locator('[data-mermaid-block]').nth(3).locator('.doc-mermaid');
    await directive.locator('svg').waitFor();
    const drawn = await directive.locator('svg').evaluate((svg) => ({
      foreignObjects: svg.querySelectorAll('foreignObject').length,
      css: Array.from(svg.querySelectorAll('style')).map((s) => s.textContent ?? '').join(''),
      position: getComputedStyle(svg).position,
      fill: getComputedStyle(svg.querySelector('.node rect, .node polygon, .node path')!).fill,
    }));
    assert.equal(drawn.foreignObjects, 0);
    assert.doesNotMatch(drawn.css, /position:\s*fixed/);
    assert.notEqual(drawn.position, 'fixed');
    assert.equal(drawn.fill, 'rgb(237, 229, 210)');

    // Sanitization held: no attacker-controlled handler, scheme, or dialog.
    assert.equal(await page.locator('img[onerror]').count(), 0);
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.deepEqual(dialogs, []);

    // Publishing the page shows the same diagram to a reader with no session.
    const published = await post(`/api/doc-pages/${page0.id}/tools`, { action: 'publish', updatedAt: page0.updatedAt });
    const publicPage = await context.newPage();
    await publicPage.goto(`${BASE_URL}/d/${published.publishToken}`);
    const publicDiagram = publicPage.locator('.doc-mermaid').filter({ hasText: 'กล้อง' });
    await publicDiagram.locator('svg').waitFor();
    assert.equal(await publicDiagram.locator('svg').count(), 1);
    assert.equal(await publicPage.locator('img[onerror]').count(), 0);
    assert.equal(await publicPage.locator('a[href^="javascript:"]').count(), 0);
    await publicPage.close();

    // Editing: typing into the Mermaid source re-renders the preview live.
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const content = page.getByRole('textbox', { name: 'Content', exact: true });
    await content.waitFor();
    // The editor opens with the caret at the end of the page, which is the end
    // of the last Mermaid block. Type there. (Clicking into an earlier block
    // raced that autofocus: about one run in three, the caret jumped back to
    // the end after the click and the typing landed in the last block anyway.)
    const editedBlock = page.locator('[data-mermaid-node-view]').last();
    await editedBlock.waitFor();
    await page.waitForFunction(() => {
      const views = document.querySelectorAll('[data-mermaid-node-view]');
      const caret = getSelection()?.anchorNode;
      return !!caret && views.length > 0 && views[views.length - 1]!.contains(caret);
    });
    await page.keyboard.type('\nA-->');
    // In the editor the author does see the parse error.
    await editedBlock.locator('.doc-mermaid-error').waitFor();
    // The guide link under the error must open, though it sits inside the
    // editable area, where a browser would otherwise treat it as text.
    const [guide] = await Promise.all([
      page.waitForEvent('popup'),
      editedBlock.getByRole('link', { name: 'How to write Mermaid that renders' }).click(),
    ]);
    await guide.waitForLoadState();
    assert.equal(new URL(guide.url()).pathname, '/wiki/mermaid-guide');
    await guide.close();
    // Back in the editor: the click took focus, so put the caret back at the
    // end of the page, which is the end of the block being edited.
    await content.focus();
    await page.keyboard.press('Control+End');
    await page.waitForFunction(() => {
      const views = document.querySelectorAll('[data-mermaid-node-view]');
      const caret = getSelection()?.anchorNode;
      return !!caret && views.length > 0 && views[views.length - 1]!.contains(caret);
    });
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    await editedBlock.locator('.doc-mermaid svg').first().waitFor();

    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();

    const saved = await fx.client.query('SELECT doc_page_content FROM pmt_doc_pages WHERE doc_page_id = $1', [page0.id]);
    const savedBody = saved.rows[0].doc_page_content.body as string;
    const savedSources = mermaidSources(savedBody);
    assert.equal(savedSources[0], VALID);
    assert.equal(savedSources[3], DIRECTIVE, 'typing and deleting the same text leaves the edited block as it was');

    // HTML export writes a Mermaid block as `pre.mermaid`, with no stray
    // copy button baked into a page that has no script to run it.
    await page.getByRole('button', { name: 'Export & Import', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'HTML', exact: true }).click(),
    ]);
    const htmlPath = path.join(tmpdir(), `mermaid-export-${Date.now()}.html`);
    await download.saveAs(htmlPath);
    const exported = await readFile(htmlPath, 'utf8');
    assert.equal((exported.match(/<pre class="mermaid"><code>/g) ?? []).length, 4);
    assert.ok(!exported.includes('doc-mermaid-copy'));

    // Importing that export back in keeps the Mermaid block recognised: the
    // new page's codeBlock still carries language 'mermaid'.
    await page.getByLabel('Import document file', { exact: true }).setInputFiles(htmlPath);
    await page.getByRole('status').filter({ hasText: 'Imported 1 page(s)' }).waitFor();
    const reimported = await fx.client.query(
      "SELECT doc_page_content FROM pmt_doc_pages WHERE doc_page_doc_id = $1 AND doc_page_id != $2 ORDER BY doc_page_sort_order DESC LIMIT 1",
      [doc.id, page0.id],
    );
    const reimportedBody = reimported.rows[0].doc_page_content.body as string;
    const tree = decodeRich(reimportedBody);
    const codeBlocks: RichNode[] = [];
    const walk = (n: RichNode) => { if (n.type === 'codeBlock') codeBlocks.push(n); n.content?.forEach(walk); };
    if (tree) walk(tree);
    assert.ok(codeBlocks.length > 0, 'the reimported page has at least one code block');
    assert.equal(codeBlocks[0]?.attrs?.language, 'mermaid');

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await fx.cleanup();
  }
});
