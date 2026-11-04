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

    // The invalid block keeps showing its source and surfaces an error.
    await page.locator('.doc-mermaid-error').first().waitFor();
    assert.equal(await page.locator('.doc-mermaid-source').count(), 1);
    assert.equal(await page.locator('.doc-mermaid-error').count(), 1);

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
    const mermaidCode = page.locator('[data-mermaid-node-view] code').first();
    await mermaidCode.waitFor();
    await mermaidCode.click();
    await page.keyboard.press('End');
    await page.keyboard.type('\nA-->');
    await page.locator('[data-mermaid-node-view] .doc-mermaid-error').waitFor();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    await page.locator('[data-mermaid-node-view] .doc-mermaid svg').waitFor();

    await page.getByRole('button', { name: 'Done editing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();

    const saved = await fx.client.query('SELECT doc_page_content FROM pmt_doc_pages WHERE doc_page_id = $1', [page0.id]);
    const savedBody = saved.rows[0].doc_page_content.body as string;
    const [savedValid] = mermaidSources(savedBody);
    assert.equal(savedValid, VALID);

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
    assert.equal((exported.match(/<pre class="mermaid"><code>/g) ?? []).length, 3);
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
