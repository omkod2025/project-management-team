import { contentMarkdown, decodeRich } from './doc-rich-content.ts';
import { domainError } from './errors.ts';

/** Markdown is a portable export, not a lossless representation of rich pages. */
export function mcpPageContent(current: string, input: { markdown?: string; rich_content?: string }): string {
  if ((input.markdown === undefined) === (input.rich_content === undefined)) {
    throw domainError('E_INVALID_DOC', 'Provide exactly one of markdown or rich_content.');
  }
  if (input.rich_content !== undefined) {
    try {
      if (typeof input.rich_content !== 'string' || !decodeRich(input.rich_content)) throw new Error('Not rich content');
    } catch {
      throw domainError('E_INVALID_DOC', 'Send valid fieldbook-rich-v1 content from read_page with include_rich_content.');
    }
    return input.rich_content;
  }
  if (typeof input.markdown !== 'string') throw domainError('E_INVALID_DOC', 'Send page content as text.');
  if (decodeRich(current)) {
    if (input.markdown === contentMarkdown(current)) return current;
    throw domainError('E_INVALID_DOC', 'This page uses rich content. Read it with include_rich_content: true and edit rich_content to preserve its structure.');
  }
  return input.markdown;
}
