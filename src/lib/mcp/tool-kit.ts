import 'server-only';
import { DomainError } from '@/lib/errors';
import type { McpAuth } from '@/lib/access-tokens';

/**
 * What every MCP tool handler runs with: the resolved bearer token itself
 * (`resolveBearer`'s result) — a token id, its owner, its grants and its
 * effective scope. One shared shape so a module's tools (`registerWikiTools`
 * and the ones Tasks 5 and 6 add) all read it the same way.
 */
export type McpContext = McpAuth;

export const NOT_FOUND = 'Not found.';

/** Anything outside a token's effective scope — a wiki or project id it cannot reach, or a malformed one. */
export class OutOfScope extends Error {}
export const outOfScope = (): OutOfScope => new OutOfScope(NOT_FOUND);

export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/**
 * Runs one tool body. "Not found." for anything out of scope; any other
 * failure is logged here and reported to the client without its message, so
 * no stack trace or database text crosses the wire.
 */
export async function answer(name: string, run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await run()) }] };
  } catch (err) {
    if (err instanceof DomainError) {
      if (err.code === 'E_NOT_FOUND') return { content: [{ type: 'text', text: NOT_FOUND }], isError: true };
      const message = err.code === 'E_DOC_CONFLICT'
        ? 'This page changed. Read it again before retrying your edit.' : err.message;
      return { content: [{ type: 'text', text: JSON.stringify({ error: { code: err.code, message } }) }], isError: true };
    }
    if (err instanceof OutOfScope) return { content: [{ type: 'text', text: NOT_FOUND }], isError: true };
    console.error(`[mcp] ${name} failed`, err);
    return { content: [{ type: 'text', text: 'The server could not answer this request.' }], isError: true };
  }
}

export const readOnly = { readOnlyHint: true } as const;
export const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
