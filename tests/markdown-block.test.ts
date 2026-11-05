import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';
import { encodeRich, contentMarkdown, type RichNode } from '../src/lib/doc-rich-content.ts';
import { codeFence, isMarkdownLanguage } from '../src/lib/markdown-block-rules.ts';

// Spec 12 §2b. The rendering itself (doc-content.tsx, the node view) is .tsx,
// which Node's type-stripping runner cannot load; these tests drive the data
// both of them read from — the language test, the fence, the round trip.

const manager = new MarkdownManager({ extensions: docEditorExtensions(true) });

const block = (language: string, text: string): RichNode => ({
  type: 'doc',
  content: [{ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] }],
});

test('D-83: markdown and md are Markdown blocks, in any case, first word only', () => {
  for (const lang of ['markdown', 'md', 'Markdown', ' MD ', 'markdown title="x"'])
    assert.equal(isMarkdownLanguage(lang), true, lang);
  for (const lang of ['', 'mermaid', 'mdx', 'markdownish', null, undefined, 3])
    assert.equal(isMarkdownLanguage(lang), false, String(lang));
});

test('the export fence outgrows the longest backtick run in the body, three at least', () => {
  assert.equal(codeFence('plain text'), '```');
  assert.equal(codeFence('one ` and two ``'), '```');
  assert.equal(codeFence('```bash\nnpm ci\n```'), '````');
  assert.equal(codeFence('`````'), '``````');
});

test('a Markdown block holding its own fences exports a fence they cannot close', () => {
  const source = '# VMS\n\n```bash\nnpm ci\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const exported = contentMarkdown(encodeRich(block('markdown', source)));
  assert.equal(exported.trim(), `\`\`\`\`markdown\n${source}\n\`\`\`\``);
});

test('D-83: import then export gives the same body back — nested fences, Thai, hostile HTML', () => {
  const source = [
    '# คู่มือ ติดตั้ง',
    '',
    '<script>alert(1)</script> <img src=x onerror=alert(1)>',
    '',
    '```bash',
    "npm run build '); DROP TABLE pmt_wikis; --",
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    '  A["เครื่องอ่านบัตร"] --> B',
    '```',
  ].join('\n');
  const first = contentMarkdown(encodeRich(block('markdown', source)));
  const parsed = manager.parse(first) as RichNode;
  const node = parsed.content?.[0];
  assert.equal(node?.type, 'codeBlock');
  assert.equal(isMarkdownLanguage(node?.attrs?.language), true);
  assert.equal((node?.content ?? []).map((c) => c.text ?? '').join(''), source);
  assert.equal(contentMarkdown(encodeRich(parsed)), first);
});

test('a plain code block keeps its three-backtick fence', () => {
  assert.equal(contentMarkdown(encodeRich(block('js', 'const x = 1;'))).trim(), '```js\nconst x = 1;\n```');
});
