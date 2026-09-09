import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { docAssetCsp, validateDocSvg } from '../../src/lib/doc-svg.ts';

test('SVG renders with HTML labels while scripts and network resources remain blocked', async () => {
  const requests: string[] = [];
  const svg = validateDocSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="document.documentElement.setAttribute('executed','yes')">
    <script>document.documentElement.setAttribute('executed','yes');fetch('/leak')</script>
    <style>@import url('/external.css'); .label { color: rgb(255, 0, 0); }</style>
    <rect width="100" height="100" fill="blue"/>
    <foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml" class="label">HTML label<img src="/external.png"/><iframe src="/frame"/></div></foreignObject>
    <image href="/external.svg"/>
  </svg>`));
  const server = createServer((req, res) => {
    requests.push(req.url ?? '');
    if (req.url === '/asset.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-security-policy': docAssetCsp, 'x-content-type-options': 'nosniff' });
      res.end(svg);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<img src="/asset.svg"/>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    await page.goto(`${origin}/asset.svg`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('svg').getAttribute('executed'), null);
    assert.equal(await page.locator('.label').evaluate(el => getComputedStyle(el).color), 'rgb(255, 0, 0)');
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('img').evaluate(el => (el as HTMLImageElement).naturalWidth), 100);
    assert.deepEqual(requests.filter(url => /external|leak|frame/.test(url)), []);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
