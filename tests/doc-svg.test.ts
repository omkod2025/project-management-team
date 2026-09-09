import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocSvg } from '../src/lib/doc-svg.ts';
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const validate = (text: string) => validateDocSvg(Buffer.from(text));

test('preserves SVG features instead of filtering drawing elements and CSS', () => {
  for (const body of [
    '<defs><path id="p" d="M0 0L10 10"/></defs><use href="#p"/><text>ทดสอบ</text>',
    '<style>/* export */ @media (min-width:1px){.x:hover{transform:translate(1px);--c:red;fill:var(--c)}}</style>',
    '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex">Label</div></foreignObject>',
    '<rect><animate attributeName="opacity" values="0;1" dur="1s" repeatCount="indefinite"/></rect>',
    '<metadata xmlns:editor="urn:editor"><editor:settings editor:version="1"/></metadata>',
    '<image href="data:image/png;base64,iVBORw0KGgo="/>',
    '<image href="https://example.com/image.png"/><script>alert(1)</script><g onload="alert(1)"/>',
  ]) assert.equal(validate(svg(body)), svg(body));
});

test('normalizes namespace-free exports and removes public DTD and XML processing instructions', () => {
  assert.equal(validate('<svg/>'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const input = svg('<rect width="10" height="10"/>');
  assert.equal(validate('<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'+input), input);
  assert.equal(validate('<?xml-stylesheet href="https://example.com/x.css"?>'+input), input);
});

test('rejects invalid XML, non-SVG documents and custom entity definitions', () => {
  for (const input of ['', svg('<g>'), '<html/>', '<svg xmlns="urn:wrong"/>', svg('')+svg(''), '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]>'+svg('&x;'), svg('&unknown;')]) {
    assert.throws(() => validate(input), input);
  }
  assert.throws(() => validateDocSvg(new Uint8Array([0xff])));
});

test('bounds document complexity', () => {
  assert.throws(() => validate(svg('<g>'.repeat(65)+'</g>'.repeat(65))));
  assert.throws(() => validate(svg('<path/>'.repeat(20000))));
});
