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

/** Where a source fails to parse, for the editor (spec 12 D-71). */
export type MermaidProblem = { line: number | null; text: string | null; detail: string };

/**
 * Turns what Mermaid threw into a line the author can find. The line is
 * `hash.loc.first_line` when the parser gives one — the `line N` in its
 * message can point one past the end — else that `line N`, clamped to the
 * source. The line's text is quoted from the source, not from Mermaid's
 * excerpt, which collapses lines and cuts Thai mid-word.
 */
export function mermaidProblem(source: string, error: unknown): MermaidProblem {
  if (!(error instanceof Error)) return { line: null, text: null, detail: 'Could not render this diagram.' };
  const lines = source.split('\n');
  if (error.name === 'UnknownDiagramError') {
    const first = lines.findIndex((l) => l.trim() !== '');
    const line = first < 0 ? 1 : first + 1;
    return {
      line,
      text: lines[line - 1] ?? '',
      detail: 'The first line must name the diagram type, for example flowchart LR or sequenceDiagram.',
    };
  }
  const loc = (error as { hash?: { loc?: { first_line?: unknown } } }).hash?.loc?.first_line;
  const stated = /\bline (\d+)/i.exec(error.message)?.[1];
  const raw = typeof loc === 'number' && loc > 0 ? loc : stated ? Number(stated) : null;
  if (raw === null) return { line: null, text: null, detail: error.message };
  const line = Math.min(Math.max(1, raw), lines.length);
  // Mermaid's message is "Parse error on line N:", its excerpt, a caret
  // line, then what it expected; the excerpt is replaced by the real line.
  const expecting = error.message.split('\n').filter((l) => /^(Expecting|Unexpected|Lexical)/.test(l));
  return { line, text: lines[line - 1] ?? '', detail: expecting.join('\n') || error.message };
}

export function assertMermaidLimits(value: string): void {
  for (const source of mermaidSources(value)) {
    if (source.length > MERMAID_MAX_CHARS) {
      throw domainError('E_INVALID_DOC', 'Keep each Mermaid diagram within 50,000 characters.');
    }
  }
}

/**
 * The reading face, in case the page cannot say which one it loaded. The
 * renderer prefers the live `--font-read` value (next/font may rename the
 * family in a production build) and falls back to this.
 */
export const MERMAID_FONT_FALLBACK = '"Anuphan", "Anuphan Fallback", sans-serif';

/** Diagram text size. Rendering never scales a diagram below 13/16 of it, so Thai labels stay at 13px or more. */
export const MERMAID_FONT_PX = 16;

/**
 * Locked down (`strict`, no HTML labels) and drawn in the product's own ink.
 * `look: 'classic'` and `dropShadow: 'none'`: Mermaid's default "neo" look
 * puts a blurred drop shadow and a gradient stroke on every node, and the
 * world has neither (DESIGN.md § Elevation & Depth).
 *
 * `secure` lists the keys Mermaid strips, at any depth, from a diagram's own
 * `%%{init}%%` directive or frontmatter `config:`. Mermaid's default list
 * covers only the first six; without the rest, any author could switch HTML
 * labels back on or inject `themeCSS` (a fixed overlay, a remote `url()`)
 * into a published page.
 */
export const MERMAID_SECURE_KEYS = Object.freeze([
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'theme',
  'themeVariables',
  'themeCSS',
  'look',
  'htmlLabels',
  'fontFamily',
  'altFontFamily',
  'darkMode',
] as const);

export const MERMAID_CONFIG = Object.freeze({
  secure: MERMAID_SECURE_KEYS,
  startOnLoad: false,
  // Mermaid otherwise draws its own error graphic into document.body, outside
  // the block; the editor reports the error itself (D-71).
  suppressErrorRendering: true,
  securityLevel: 'strict',
  htmlLabels: false,
  theme: 'base',
  look: 'classic',
  themeVariables: Object.freeze({
    fontFamily: MERMAID_FONT_FALLBACK,
    fontSize: `${MERMAID_FONT_PX}px`,
    dropShadow: 'none',
    useGradient: false,
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
