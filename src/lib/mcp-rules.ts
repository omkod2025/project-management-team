/**
 * The List tools' rules over MCP, as pure functions.
 *
 * Same split as `token-rules.ts`: what an MCP caller may name and what its
 * arguments become are decisions, so they live where a test can reach them
 * without a database. `mcp/list-tools.ts` is the adapter that resolves ids
 * against the tables and calls the node store.
 */

import type { NodePatch } from './nodes.ts';
import { isUuid } from './token-rules.ts';

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
