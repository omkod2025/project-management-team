'use client';

import { NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from '@tiptap/react';
import { useDeferredValue, useState, type ReactNode } from 'react';
import MermaidDiagram from './mermaid-diagram';
import { MarkdownBlock } from './markdown-source';
import { isMermaidLanguage } from '@/lib/mermaid-rules';
import { isMarkdownLanguage } from '@/lib/markdown-block-rules';
import { safeDocUrl } from '@/lib/doc-rich-content';
import { codeBlockLanguageClass } from '@/lib/doc-code-block-class';

/**
 * The single node view `MermaidCodeBlock` registers for every `codeBlock`
 * node. ProseMirror chooses a node view per node *type*, not per instance, so
 * one language switch (`js` → `mermaid` and back) has to stay inside one
 * component rather than swapping node views. A plain language renders exactly
 * what the default code block would — an editable `<pre><code>` and nothing
 * else. Mermaid additionally draws the live diagram beneath the same
 * editable source, so what the author sees while typing is what read mode
 * and the published page render from the identical text. A Markdown block
 * (spec 12 D-84, D-85) shows only its source until the author asks for the
 * preview, which then sits to the right of it, and offers to become that
 * content for good.
 */
export default function MermaidNodeView({ node, extension, HTMLAttributes, editor, getPos }: ReactNodeViewProps) {
  const mermaid = isMermaidLanguage(node.attrs.language);
  const markdown = isMarkdownLanguage(node.attrs.language);
  // Stock CodeBlock.renderHTML (node_modules/@tiptap/extension-code-block)
  // puts the node's own HTMLAttributes on <pre> and, when a language is set,
  // `languageClassPrefix + language` as the <code> class. A plain language
  // has to keep producing that exact DOM — editors, CSS and any code reading
  // the rendered HTML elsewhere all depend on it — even though it now flows
  // through this node view instead of `renderHTML`.
  const codeClass = codeBlockLanguageClass(extension.options.languageClassPrefix, node.attrs.language);
  const source = (
    <pre {...HTMLAttributes}>
      <NodeViewContent<'code'> as="code" className={codeClass} />
    </pre>
  );
  if (markdown) {
    return (
      <NodeViewWrapper data-markdown-node-view="">
        <MarkdownEditing source={node.textContent} onConvert={() => {
          const from = getPos();
          if (typeof from !== 'number') return;
          // One transaction, so a single undo brings the source back (D-85).
          editor.chain().focus()
            .insertContentAt({ from, to: from + node.nodeSize }, node.textContent, { contentType: 'markdown' })
            .run();
        }}>
          {source}
        </MarkdownEditing>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper data-mermaid-node-view={mermaid ? '' : undefined}>
      {source}
      {/* Not editable, so the error's guide link opens like a link rather
          than being treated as text inside the editor. */}
      {mermaid && <div contentEditable={false}><MermaidDiagram source={node.textContent} showSource /></div>}
    </NodeViewWrapper>
  );
}

const editorUrl = (raw: unknown): string | null => (safeDocUrl(raw) ? raw : null);

/**
 * A Markdown block while editing (D-84): the source alone, until Preview
 * puts the rendered content beside it — source left, preview right; stacked
 * on a phone. The choice is the author's for this sitting and is not saved.
 */
function MarkdownEditing({ source, onConvert, children }: {
  source: string;
  onConvert: () => void;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <>
      <div className="doc-markdown-bar" contentEditable={false}>
        <button type="button" className="doc-mermaid-copy" aria-pressed={preview} onClick={() => setPreview((on) => !on)}>
          {preview ? 'Hide preview' : 'Preview'}
        </button>
        <button type="button" className="doc-mermaid-copy" onClick={onConvert} disabled={!source.trim()}>
          Convert to page content
        </button>
      </div>
      <div className={preview ? 'doc-markdown-split' : undefined}>
        {children}
        {preview && <MarkdownPreview source={source} />}
      </div>
    </>
  );
}

/** The rendered side. It lags the typing (useDeferredValue) so a long README never slows the keystroke. */
function MarkdownPreview({ source }: { source: string }) {
  const deferred = useDeferredValue(source);
  return (
    <div className="doc-markdown-preview" contentEditable={false} aria-label="Markdown preview">
      <MarkdownBlock source={deferred} url={editorUrl} showCopy={false} />
    </div>
  );
}
