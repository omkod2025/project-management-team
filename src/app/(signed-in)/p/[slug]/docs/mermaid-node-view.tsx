'use client';

import { NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from '@tiptap/react';
import MermaidDiagram from './mermaid-diagram';
import { isMermaidLanguage } from '@/lib/mermaid-rules';
import { codeBlockLanguageClass } from '@/lib/doc-code-block-class';

/**
 * The single node view `MermaidCodeBlock` registers for every `codeBlock`
 * node. ProseMirror chooses a node view per node *type*, not per instance, so
 * one language switch (`js` → `mermaid` and back) has to stay inside one
 * component rather than swapping node views. A plain language renders exactly
 * what the default code block would — an editable `<pre><code>` and nothing
 * else. Mermaid additionally draws the live diagram beneath the same
 * editable source, so what the author sees while typing is what read mode
 * and the published page render from the identical text.
 */
export default function MermaidNodeView({ node, extension, HTMLAttributes }: ReactNodeViewProps) {
  const mermaid = isMermaidLanguage(node.attrs.language);
  // Stock CodeBlock.renderHTML (node_modules/@tiptap/extension-code-block)
  // puts the node's own HTMLAttributes on <pre> and, when a language is set,
  // `languageClassPrefix + language` as the <code> class. A plain language
  // has to keep producing that exact DOM — editors, CSS and any code reading
  // the rendered HTML elsewhere all depend on it — even though it now flows
  // through this node view instead of `renderHTML`.
  const codeClass = codeBlockLanguageClass(extension.options.languageClassPrefix, node.attrs.language);
  return (
    <NodeViewWrapper data-mermaid-node-view={mermaid ? '' : undefined}>
      <pre {...HTMLAttributes}>
        <NodeViewContent<'code'> as="code" className={codeClass} />
      </pre>
      {mermaid && <MermaidDiagram source={node.textContent} showSource />}
    </NodeViewWrapper>
  );
}
