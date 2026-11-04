'use client';

import { NodeViewWrapper, NodeViewContent, type ReactNodeViewProps } from '@tiptap/react';
import MermaidDiagram from './mermaid-diagram';
import { isMermaidLanguage } from '@/lib/mermaid-rules';

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
export default function MermaidNodeView({ node }: ReactNodeViewProps) {
  const mermaid = isMermaidLanguage(node.attrs.language);
  return (
    <NodeViewWrapper data-mermaid-node-view={mermaid ? '' : undefined}>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
      {mermaid && <MermaidDiagram source={node.textContent} showSource />}
    </NodeViewWrapper>
  );
}
