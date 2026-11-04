/**
 * The editor's `codeBlock` extension, swapped in by `rich-editor.tsx` only.
 *
 * This file imports `@tiptap/react` and a `.tsx` node view, so it must never
 * be reached from `doc-editor-extensions.ts`'s default path: that module is
 * also loaded by Node tests and by server code that renders Markdown and
 * schemas without a browser or React available. `docEditorExtensions` only
 * sees this extension when a caller passes it explicitly through
 * `opts.codeBlock`.
 */
import CodeBlock from '@tiptap/extension-code-block';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MermaidNodeView from '@/app/(signed-in)/p/[slug]/docs/mermaid-node-view';

export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
