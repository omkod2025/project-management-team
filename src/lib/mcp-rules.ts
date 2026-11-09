/**
 * The List tools' rules over MCP, as pure functions.
 *
 * Same split as `token-rules.ts`: what an MCP caller may name and what its
 * arguments become are decisions, so they live where a test can reach them
 * without a database. `mcp/list-tools.ts` and `mcp/docs-tools.ts` are the
 * adapters that resolve ids against the tables and call the stores.
 */

import type { NodePatch } from './nodes.ts';
import { isUuid } from './token-rules.ts';
import { domainError } from './errors.ts';
import { mcpPageContent } from './wiki-mcp-content.ts';
import { removedDocAssetIds } from './doc-asset-references.ts';
import { pageSections, type PageContent, type PageTemplate } from './doc-rules.ts';

/**
 * The id as the token may use it: uuid-shaped, lowercased (a UUID is
 * case-insensitive; the scope and the database hold lowercase), and in
 * `ids`. Anything else is `null`, which the caller answers as "Not found." —
 * a malformed id and one outside scope are indistinguishable.
 */
export function scopedId(ids: readonly string[], raw: unknown): string | null {
  if (typeof raw !== 'string' || !isUuid(raw)) return null;
  const id = raw.toLowerCase();
  return ids.includes(id) ? id : null;
}

/** `update_task`'s field arguments, snake_case as they cross the wire. */
export type TaskArgs = {
  name?: string;
  estimate_start?: string | null;
  estimate_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  values?: Record<string, unknown>;
};

const PATCH_KEYS = [
  ['name', 'name'],
  ['estimate_start', 'estimateStart'],
  ['estimate_end', 'estimateEnd'],
  ['actual_start', 'actualStart'],
  ['actual_end', 'actualEnd'],
  ['values', 'values'],
] as const satisfies ReadonlyArray<readonly [keyof TaskArgs, keyof NodePatch]>;

/**
 * The node patch an `update_task` call asks for: only the keys present in
 * `args`, renamed snake → camel, values untouched. Nothing is derived — an
 * estimate never fills an actual nor the other way round (CLAUDE.md, "The
 * rule the product exists for"), so a key the caller left out stays out.
 */
export function taskPatch(args: TaskArgs): NodePatch {
  const patch: Record<string, unknown> = {};
  for (const [from, to] of PATCH_KEYS) {
    if (args[from] !== undefined) patch[to] = args[from];
  }
  return patch as NodePatch;
}

/**
 * The page content an `update_doc_page` call asks for: one section replaced,
 * every other section exactly as it was. `section` defaults to `body` (a Free
 * page's only one) and must belong to the template. Rich content survives a
 * Markdown edit that leaves its Markdown unchanged and refuses one that does
 * not (`mcpPageContent`). An MCP edit may never drop a file link: removing a
 * file stays a deliberate act in the app, where the editor sees what goes.
 */
export function docPageContent(
  current: PageContent,
  template: PageTemplate,
  input: { section?: string; markdown?: string; rich_content?: string },
): PageContent {
  const section = input.section ?? 'body';
  if (!pageSections(template).some(([key]) => key === section)) {
    throw domainError('E_INVALID_DOC', 'This section does not belong to the page template.');
  }
  const next = { ...current, [section]: mcpPageContent(current[section] ?? '', input) };
  if (removedDocAssetIds(current, next).length > 0) {
    throw domainError('E_INVALID_DOC', 'This edit would remove a file from the page. Keep every file link, or remove files in the app.');
  }
  return next;
}
