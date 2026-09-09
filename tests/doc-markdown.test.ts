import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';

const manager = new MarkdownManager({ extensions: docEditorExtensions() });
const samples = [
  '# หัวข้อ\n\n**ตัวหนา** and *italic* with `code` 😀',
  '- one\n  - two\n    - three\n      - four\n\n1. ordered\n2. second',
  '- [x] done\n- [ ] pending',
  '| Module | Scope |\n| --- | --- |\n| NVR | **Plates** |\n| Megvii | `license` |',
  '> quoted\n\n```ts\nconst x = 1;\n```\n\n---',
  '[design](https://example.com/design)\n\n![diagram](/api/doc-assets/123)',
  '[📎 เอกสารแนบ.pdf (12 KB)](/api/doc-assets/12345678-1234-1234-1234-123456789abc)',
];
for (const [index, markdown] of samples.entries()) {
  test(`D-55: supported Markdown round-trip ${index + 1}`, () => {
    const first = manager.parse(markdown);
    const second = manager.parse(manager.serialize(first));
    assert.deepEqual(second, first);
  });
}
