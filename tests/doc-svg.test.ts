import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocSvg } from '../src/lib/doc-svg.ts';
const svg = (body:string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const validate = (text:string) => validateDocSvg(Buffer.from(text));
test('static SVG preserves shapes, Thai text and local references', () => {
  const input = svg('<defs><path id="p" d="M0 0L10 10"/></defs><use href="#p"/><text x="5" y="20" style="fill:url(#p);stroke:blue">ทดสอบ</text>');
  assert.equal(validate(input), input);
});
test('static class stylesheet preserves diagram fonts, colors and local arrow references', () => {
  const input = svg('<style>.label{font-family:"Noto Sans Thai",sans-serif;fill:#123456}.edge{marker-end:url(#arrow);stroke-width:2}</style><text class="label">Diagram</text>');
  assert.equal(validate(input), input);
});
test('stylesheet rejects imports, external URLs, escapes, markup and active properties', () => {
  for (const css of ['@import "https://example.com/x.css";', '.x{fill:url(https://example.com/a)}', '.x{fill:u\\72l(x)}', '.x{animation:spin 1s}', '.x{background-image:image-set("https://example.com/a")}', '.x{fill:red} <script/>', '.x{--resource:url(#a)}']) {
    assert.throws(() => validate(svg(`<style>${css}</style>`)));
  }
});
for (const [name,body] of Object.entries({script:'<script>alert(1)</script>', event:'<path onload="alert(1)"/>', html:'<foreignObject/>', external:'<use href="https://example.com/a.svg"/>', entity:'<use href="&#106;avascript:alert(1)"/>', css:'<path style="fill:url(https://example.com/x)"/>', escaped:'<path style="fill:u\\72l(x)"/>', animation:'<animate attributeName="href"/>', namespace:'<path xmlns="http://www.w3.org/1999/xhtml"/>'})) {
  test(`rejects ${name}`, () => assert.throws(() => validate(svg(body))));
}
test('rejects malformed XML, DTDs, processing instructions, and non-SVG', () => {
  for (const input of ['<svg/>', svg('<g>'), '<!DOCTYPE svg>'+svg(''), '<?xml-stylesheet href="x"?>'+svg(''), '<html/>']) assert.throws(() => validate(input));
});
