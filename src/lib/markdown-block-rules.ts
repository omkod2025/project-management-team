/**
 * Pure rules for Markdown blocks (spec 12 §2b, D-83). A Markdown block is a
 * `codeBlock` node whose language is `markdown` or `md`; its source is kept as
 * typed and rendered as formatted content when read. No server-only or
 * Node-only APIs here: this module is imported from client components.
 */

const MARKDOWN_LANGUAGES = new Set(['markdown', 'md']);

export function isMarkdownLanguage(lang: unknown): boolean {
  if (typeof lang !== 'string') return false;
  return MARKDOWN_LANGUAGES.has((lang.trim().split(/\s+/)[0] ?? '').toLowerCase());
}

/**
 * The backtick fence a code block is exported with: one longer than the
 * longest backtick run in its body, three at least, so a body that holds its
 * own ``` fences — a README in a Markdown block — cannot close it early.
 */
export function codeFence(body: string): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}
