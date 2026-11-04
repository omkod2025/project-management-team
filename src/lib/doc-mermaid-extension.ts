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

type LanguageAttribute = {
  default?: string | null;
  rendered?: boolean;
  parseHTML?: ((element: HTMLElement) => unknown) | null;
};

export const MermaidCodeBlock = CodeBlock.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as {
      language?: LanguageAttribute;
    };
    return {
      ...parentAttributes,
      language: {
        ...parentAttributes.language,
        // This app's own HTML/print export writes a Mermaid block as
        // `<pre class="mermaid"><code>source</code></pre>` — the shape a
        // reader with no language-prefixed class still has to come back as
        // `language: 'mermaid'` on re-import. The stock rule only ever looks
        // at the <code> child's `language-*` class, so that case is checked
        // first and the stock behaviour kept as the fallback.
        parseHTML: (element: HTMLElement) => {
          if (element.classList.contains('mermaid')) return 'mermaid';
          return parentAttributes.language?.parseHTML?.(element) ?? null;
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
