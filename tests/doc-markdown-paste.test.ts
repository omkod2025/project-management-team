import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';
import { looksLikeMarkdown, pastedMarkdown, sliceIsPlainCode } from '../src/lib/doc-markdown-paste.ts';

const page = '# VMS Registration App\n\n## Features\n\n- **Registration System**\n  - **Visitor registration** — ลงทะเบียนผู้มาติดต่อ\n';
const diagram = 'ขั้นตอน\n\n```mermaid\ngraph TD\n  A[เริ่ม] --> B[จบ]\n```\n';

test('headings, lists, fences, tables, quotes and inline marks read as Markdown', () => {
  assert.equal(looksLikeMarkdown(page), true);
  assert.equal(looksLikeMarkdown(diagram), true);
  assert.equal(looksLikeMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), true);
  assert.equal(looksLikeMarkdown('> quoted\n> more'), true);
  assert.equal(looksLikeMarkdown('see **this** part'), true);
  assert.equal(looksLikeMarkdown('read [the guide](https://example.com)'), true);
  assert.equal(looksLikeMarkdown('1. first\n2. second'), true);
});

test('ordinary prose stays ordinary text', () => {
  assert.equal(looksLikeMarkdown(''), false);
  assert.equal(looksLikeMarkdown('ประชุมวันจันทร์ 10:00 ห้อง 3'), false);
  assert.equal(looksLikeMarkdown('Paragraph one\nParagraph two'), false);
  assert.equal(looksLikeMarkdown('#hashtag and 2 * 3 * 4'), false);
  assert.equal(looksLikeMarkdown('- just one dash line'), false);
});

test('plain-text Markdown with no HTML is parsed', () => {
  assert.equal(pastedMarkdown({ text: page, html: '', vscodeMode: '', plainCode: false }), page);
  assert.equal(pastedMarkdown({ text: 'hello', html: '', vscodeMode: '', plainCode: false }), null);
});

test('rich HTML keeps its own formatting unless it is only a wrapper round the source', () => {
  assert.equal(pastedMarkdown({ text: page, html: '<h1>VMS</h1><ul><li><b>x</b></li></ul>', vscodeMode: '', plainCode: false }), null);
  // A code view on a web page or chat copies the source as one <pre>.
  assert.equal(pastedMarkdown({ text: page, html: `<pre><code>${page}</code></pre>`, vscodeMode: '', plainCode: true }), page);
  // VS Code says which language the selection was in.
  assert.equal(pastedMarkdown({ text: page, html: '<div>…</div>', vscodeMode: 'markdown', plainCode: false }), page);
  assert.equal(pastedMarkdown({ text: 'const a = 1;', html: '<div>…</div>', vscodeMode: 'typescript', plainCode: false }), null);
});

test('CRLF from Windows clipboards is normalised before parsing', () => {
  assert.equal(pastedMarkdown({ text: '# A\r\n\r\n- **b**\r\n', html: '', vscodeMode: '', plainCode: false }), '# A\n\n- **b**\n');
});

test('only a single code block with no language, or a Markdown one, counts as a plain wrapper', () => {
  const schema = getSchema(docEditorExtensions(true));
  const block = (language: string | null) => new Slice(Fragment.from(schema.node('codeBlock', { language }, schema.text(page))), 0, 0);
  assert.equal(sliceIsPlainCode(block(null)), true);
  assert.equal(sliceIsPlainCode(block('markdown')), true);
  assert.equal(sliceIsPlainCode(block('md')), true);
  assert.equal(sliceIsPlainCode(block('python')), false);
  assert.equal(sliceIsPlainCode(new Slice(Fragment.from(schema.node('paragraph', null, schema.text('x'))), 0, 0)), false);
});
