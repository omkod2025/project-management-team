import type { Slice } from '@tiptap/pm/model';

/**
 * Pasting Markdown source into the rich editor.
 *
 * ProseMirror pastes `text/plain` as literal paragraphs, and a clipboard that
 * also carries a lone `<pre>` (a code view on a web page, a chat answer) or
 * VS Code's language tag lands as one code block. Either way `**bold**`, the
 * headings and a ```mermaid fence stay as characters and nothing is drawn.
 * These rules decide when the pasted text is Markdown the author meant to be
 * read, so the editor can parse it instead.
 */

const BLOCK_SIGNALS = [
  /^#{1,6}\s+\S/m, // heading
  /^(```|~~~)/m, // fenced code, Mermaid included
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m, // GFM table rule
  /^>\s/m, // blockquote
];
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+\S/;
const INLINE_SIGNALS = [
  /\*\*[^*\n]+\*\*/, // bold
  /__[^_\n]+__/, // bold
  /\[[^\]\n]+\]\([^)\s]+\)/, // link
  /`[^`\n]+`/, // inline code
];

export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  if (BLOCK_SIGNALS.some((re) => re.test(text))) return true;
  // One dash line is a sentence that happens to start with a dash.
  if (text.split('\n').filter((line) => LIST_ITEM.test(line)).length >= 2) return true;
  return INLINE_SIGNALS.some((re) => re.test(text));
}

const MARKDOWN_LANGUAGES = new Set(['', 'markdown', 'md']);

/** The pasted HTML parsed to nothing but one code block holding source text. */
export function sliceIsPlainCode(slice: Slice): boolean {
  const only = slice.content.childCount === 1 ? slice.content.firstChild : null;
  return !!only && only.type.name === 'codeBlock'
    && MARKDOWN_LANGUAGES.has(String(only.attrs.language ?? '').trim().toLowerCase());
}

/**
 * The Markdown to parse in place of the default paste, or `null` to leave the
 * paste alone. HTML that carries its own formatting wins: it is already rich.
 */
export function pastedMarkdown({ text, html, vscodeMode, plainCode }: {
  text: string; html: string; vscodeMode: string; plainCode: boolean;
}): string | null {
  const source = text.replace(/\r\n?/g, '\n');
  if (!looksLikeMarkdown(source)) return null;
  if (vscodeMode) return vscodeMode.toLowerCase() === 'markdown' ? source : null;
  if (html && !plainCode) return null;
  return source;
}

/** VS Code's clipboard names the language of the copied selection. */
export function vscodeClipboardMode(data: string): string {
  try { return String((JSON.parse(data) as { mode?: unknown })?.mode ?? ''); }
  catch { return ''; }
}
