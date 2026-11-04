import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { docEditorExtensions } from '../src/lib/doc-editor-extensions.ts';
import { encodeRich, decodeRich, contentMarkdown, type RichNode } from '../src/lib/doc-rich-content.ts';
import { isMermaidLanguage } from '../src/lib/mermaid-rules.ts';

// Importing doc-content.tsx / mermaid-diagram.tsx here is not possible: Node's
// type-stripping runner has no JSX transform, so it cannot load a .tsx file
// at all (ERR_UNKNOWN_FILE_EXTENSION). The brief's fallback is used instead:
// drive the same data (parse → rich JSON → Markdown export) that doc-content's
// `codeBlock` branch and the ReactMarkdown `code` override both read from.
// The actual TSX rendering (`doc-mermaid-source`, escaped source, plain
// `<pre><code>` for non-mermaid languages) is left to Task 4.

const manager = new MarkdownManager({ extensions: docEditorExtensions(true) });

test('D-mermaid: a mermaid fence parses to a codeBlock node carrying the mermaid language', () => {
  const markdown = '```mermaid\nflowchart LR\n  A["กล้อง"] --> B\n```';
  const json = manager.parse(markdown);
  const block = json.content?.[0];
  assert.equal(block?.type, 'codeBlock');
  assert.equal(isMermaidLanguage(block?.attrs?.language), true);
});

test('D-mermaid: round trip through encodeRich/contentMarkdown preserves the fence body byte for byte', () => {
  const markdown = '```mermaid\nflowchart LR\n  A["กล้อง"] --> B\n```';
  const json = manager.parse(markdown) as RichNode;
  const rich = encodeRich(json);
  const exported = contentMarkdown(rich);
  const fenceBody = /```mermaid\n([\s\S]*?)\n```/.exec(exported)?.[1];
  const originalBody = /```mermaid\n([\s\S]*?)\n```/.exec(markdown)?.[1];
  assert.equal(fenceBody, originalBody);
});

test('a js code block is not treated as mermaid', () => {
  const markdown = '```js\nconst x = 1;\n```';
  const json = manager.parse(markdown);
  const block = json.content?.[0];
  assert.equal(block?.type, 'codeBlock');
  assert.equal(isMermaidLanguage(block?.attrs?.language), false);
});

test('D-mermaid: a hostile source survives encodeRich/decodeRich/contentMarkdown unchanged', () => {
  const source = "'); DROP TABLE pmt_docs; --\n<script>alert(1)</script>";
  const json: RichNode = {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: 'mermaid' },
        content: [{ type: 'text', text: source }],
      },
    ],
  };
  const rich = encodeRich(json);
  const decoded = decodeRich(rich);
  const decodedText = decoded?.content?.[0]?.content?.map((c) => c.text ?? '').join('');
  assert.equal(decodedText, source);
  const exported = contentMarkdown(rich);
  const fenceBody = /```mermaid\n([\s\S]*?)\n```/.exec(exported)?.[1];
  assert.equal(fenceBody, source);
});
