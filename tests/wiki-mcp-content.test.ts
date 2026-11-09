import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRich, contentMarkdown } from '../src/lib/doc-rich-content.ts';
import { mcpPageContent } from '../src/lib/wiki-mcp-content.ts';

const rich = encodeRich({ type: 'doc', content: [
  { type: 'toggle', attrs: { label: 'หัวข้อที่ต้องไม่หาย', open: true }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'เนื้อหา', marks: [{ type: 'underline' }] }] },
  ] },
] });

test('unchanged Markdown preserves canonical rich content including labels and marks', () => {
  assert.equal(mcpPageContent(rich, { markdown: contentMarkdown(rich) }), rich);
});

test('changed Markdown cannot silently flatten an existing rich page', () => {
  assert.throws(() => mcpPageContent(rich, { markdown: contentMarkdown(rich) + ' new text' }), /include_rich_content/);
});

test('explicit rich updates retain rich structure and plain pages still accept Markdown', () => {
  const updated = rich.replace('หัวข้อที่ต้องไม่หาย', 'หัวข้อใหม่');
  assert.equal(mcpPageContent(rich, { rich_content: updated }), updated);
  assert.equal(mcpPageContent('old', { markdown: 'new' }), 'new');
});

test('exactly one valid content representation is required', () => {
  for (const input of [{}, { markdown: 'text', rich_content: rich }, { rich_content: 'plain' }, { rich_content: 'fieldbook-rich-v1:broken' }]) {
    assert.throws(() => mcpPageContent(rich, input));
  }
});
