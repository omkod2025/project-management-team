import { domainError } from './errors.ts';
import { contentMarkdown, decodeRich } from './doc-rich-content.ts';

export function parseNewDoc(input: unknown): { title: string; version: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw domainError('E_INVALID_DOC', 'Enter a document title.');
  }
  const { title, version = '' } = input as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    throw domainError('E_INVALID_DOC', 'Use a document title between 1 and 200 characters.');
  }
  if (typeof version !== 'string' || version.trim().length > 100) {
    throw domainError('E_INVALID_DOC', 'Keep the version within 100 characters.');
  }
  return { title: title.trim(), version: version.trim() };
}

export type DocSummary = {
  id: string;
  title: string;
  version: string;
  createdByName: string | null;
  updatedAt: string;
};

export const MODULE_SECTIONS = [
  ['description', 'Description'], ['wantFeature', 'Want Feature'], ['decisions', 'Decisions'],
  ['currentScope', 'Current Scope'], ['nextPhase', 'Next Phase'],
] as const;
export type PageTemplate = 'free' | 'module';
export type PageContent = Record<string, string>;
export const pageSections = (template: PageTemplate): ReadonlyArray<readonly [string, string]> =>
  template === 'free' ? [['body', 'Content']] : MODULE_SECTIONS;

export function parsePageContent(value: unknown, template: PageTemplate): PageContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw domainError('E_INVALID_DOC', 'Invalid page content.');
  const input = value as Record<string, unknown>;
  const keys = pageSections(template).map(([key]) => key);
  if (Object.keys(input).some((key) => !keys.includes(key))) throw domainError('E_INVALID_DOC', 'This section does not belong to the page template.');
  const content: PageContent = {};
  for (const key of keys) {
    if (typeof input[key] !== 'string') throw domainError('E_INVALID_DOC', 'Every section must contain text.');
    content[key] = input[key];
    try { decodeRich(content[key]); } catch { throw domainError('E_INVALID_DOC', 'This page contains invalid or unsupported rich content.'); }
  }
  if (Object.values(content).join('').length > 200_000) throw domainError('E_INVALID_DOC', 'Keep each page within 200,000 characters. Split longer content into another page.');
  return content;
}

export function nextPageDepth(parentDepth: number | null) {
  const depth = parentDepth === null ? 1 : parentDepth + 1;
  if (depth > 3 || depth < 1) throw domainError('E_MAX_DEPTH', 'Pages can nest up to three levels.');
  return depth;
}

export function extendRevision(editor: string | null, lastEditor: string, lastAt: number, now: number) {
  return editor === lastEditor && now - lastAt < 30 * 60 * 1000;
}

export function pageMarkdown(template: PageTemplate, content: PageContent) {
  return template === 'free' ? contentMarkdown(content.body ?? '') : MODULE_SECTIONS.map(([key, label]) => `## ${label}\n\n${contentMarkdown(content[key] ?? '')}`).join('\n\n');
}

export type DocPage = {
  id: string; docId: string; parentId: string | null; depth: number; title: string; slug: string;
  template: PageTemplate; nodeId: string | null; content: PageContent; updatedAt: string;
  nodeArchived: boolean; hue: number | null;
  settings?: Record<string,string|boolean>; protected?: boolean;
  /** The published link's secret, or null when the page is private (spec 10 §11). */
  publishToken?: string | null;
  ownerNames?: string[];
};
