/**
 * Pure rules for Mermaid diagram blocks (spec: docs/superpowers/plans/2026-11-04-mermaid-blocks.md).
 * A Mermaid block is a `codeBlock` node with language `mermaid` in rich content,
 * or a ```mermaid fence in legacy Markdown. No server-only or Node-only APIs
 * here: this module is imported from client components.
 */
import { domainError } from './errors.ts';
import { decodeRich, type RichNode } from './doc-rich-content.ts';

export const MERMAID_MAX_CHARS = 50_000;

export function isMermaidLanguage(lang: unknown): boolean {
  return (String(lang).trim().split(/\s+/)[0] ?? '').toLowerCase() === 'mermaid';
}

function walkCodeBlocks(node: RichNode, out: string[]) {
  if (node.type === 'codeBlock' && isMermaidLanguage(node.attrs?.language)) {
    out.push((node.content ?? []).map((c) => c.text ?? '').join(''));
    return;
  }
  for (const child of node.content ?? []) walkCodeBlocks(child, out);
}

function markdownFences(value: string): string[] {
  const lines = value.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const match = /^(```|~~~)(.*)$/.exec(line);
    if (match) {
      const fence = match[1];
      const info = match[2] ?? '';
      const closeRe = new RegExp(`^${fence}\\s*$`);
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !closeRe.test(lines[j] ?? '')) {
        body.push(lines[j] ?? '');
        j++;
      }
      if (isMermaidLanguage(info)) out.push(body.join('\n'));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

export function mermaidSources(value: string): string[] {
  let tree: RichNode | null = null;
  try {
    tree = decodeRich(value);
  } catch {
    tree = null;
  }
  if (tree) {
    const out: string[] = [];
    walkCodeBlocks(tree, out);
    return out;
  }
  return markdownFences(value);
}

export function assertMermaidLimits(value: string): void {
  for (const source of mermaidSources(value)) {
    if (source.length > MERMAID_MAX_CHARS) {
      throw domainError('E_INVALID_DOC', 'Keep each Mermaid diagram within 50,000 characters.');
    }
  }
}

export const MERMAID_CONFIG = Object.freeze({
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  theme: 'base',
  themeVariables: Object.freeze({
    background: '#EDE5D2',
    primaryColor: '#EDE5D2',
    primaryTextColor: '#2A2622',
    primaryBorderColor: '#2A2622',
    lineColor: '#2A2622',
    textColor: '#2A2622',
    secondaryColor: '#EDE5D2',
    tertiaryColor: '#EDE5D2',
  }),
});
