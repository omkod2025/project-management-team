import { domainError } from './errors.ts';
import { contentMarkdown, decodeRich } from './doc-rich-content.ts';
import { assertMermaidLimits } from './mermaid-rules.ts';

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

/** A document in Deleted documents (admins only): restorable, or deletable for good. */
export type ArchivedDocSummary = { id: string; title: string; version: string; archivedAt: string };

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
    assertMermaidLimits(content[key]);
  }
  if (Object.values(content).join('').length > 200_000) throw domainError('E_INVALID_DOC', 'Keep each page within 200,000 characters. Split longer content into another page.');
  return content;
}

export function nextPageDepth(parentDepth: number | null) {
  const depth = parentDepth === null ? 1 : parentDepth + 1;
  if (depth > 3 || depth < 1) throw domainError('E_MAX_DEPTH', 'Pages can nest up to three levels.');
  return depth;
}

/**
 * D-61: a page and everything under it, for archiving a page with its subpages
 * and restoring them together. `include` decides which descendants count — the
 * live ones when archiving, the ones archived in the same stroke when restoring.
 * A page whose parent is left out is left out too, so the set is always one
 * connected subtree rooted at `rootId`.
 */
export function pageSubtree<P extends { id: string; parentId: string | null }>(
  pages: readonly P[], rootId: string, include: (page: P) => boolean = () => true,
): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pages) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id) && include(p)) { ids.add(p.id); grew = true; }
    }
  }
  return ids;
}

/** What deleting `pageId` would take with it: how many subpages, and the first protected one that stops it. */
export function pageDeletion(pages: readonly { id: string; parentId: string | null; title: string; protected?: boolean }[], pageId: string) {
  const ids = pageSubtree(pages, pageId);
  const locked = pages.find((p) => p.id !== pageId && ids.has(p.id) && p.protected);
  return { subpages: ids.size - 1, lockedBy: locked?.title ?? null };
}

/** The confirm dialog's note for deleting a page, naming the subpages that go with it. */
export function pageDeletionNote(subpages: number) {
  const kept = 'The page moves to Deleted pages, where you can restore it.';
  if (!subpages) return kept;
  const which = subpages === 1 ? 'Its 1 subpage is' : `Its ${subpages} subpages are`;
  return `${which} deleted with it, and come back with it on restore. ${kept}`;
}

/**
 * D-61 (updated 2026-11-12): deleting an archived page permanently removes it
 * and every page under it, deepest first so no page ever outlives its parent
 * (the parent key is ON DELETE RESTRICT). Only what is already in Deleted pages
 * can go: a live page anywhere in the subtree refuses the whole purge.
 */
export function pagePurgeOrder(
  pages: readonly { id: string; parentId: string | null; depth: number; archived: boolean }[], rootId: string,
): string[] {
  const ids = pageSubtree(pages, rootId);
  const subtree = pages.filter((p) => ids.has(p.id));
  if (!subtree.some((p) => p.id === rootId)) throw domainError('E_NOT_FOUND', 'No such deleted page.');
  if (subtree.some((p) => !p.archived)) throw domainError('E_INVALID_DOC', 'Only a deleted page can be deleted permanently. Delete it first.');
  return [...subtree].sort((a, b) => b.depth - a.depth).map((p) => p.id);
}

/** The confirm dialog's note for deleting a page permanently. */
export function pagePurgeNote(subpages: number) {
  const also = subpages === 0 ? '' : subpages === 1 ? ' Its 1 deleted subpage goes with it.' : ` Its ${subpages} deleted subpages go with it.`;
  return `This cannot be undone.${also} Its history and comments are removed, and files no other page uses are deleted.`;
}

/** The confirm dialog's note for deleting a document permanently. */
export const DOC_PURGE_NOTE = 'This cannot be undone. Every page, its history and comments are removed, and files no other page uses are deleted.';

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
