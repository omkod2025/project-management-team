import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { hasModule, takeRateSlot } from '@/lib/token-rules';
import { resolveBearer } from '@/lib/access-tokens';
import { registerWikiTools } from './wiki-tools';
import { registerListTools, registerProjectTools } from './list-tools';
import type { McpContext } from './tool-kit';

/**
 * The one MCP endpoint (central MCP tokens design): the only way AI reaches
 * this install, module by module under a single Bearer token. Authentication
 * is the Bearer token alone — cookies are never read here, and a session
 * cannot reach this code path.
 *
 * Every lookup is filtered to the token's effective scope, resolved fresh on
 * this request (scope ∩ what the owner can see now). Anything outside that
 * is "Not found." — the same answer as an id that never existed (wiki spec
 * §8, existence leaks).
 */

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/**
 * Per-token hit times for the last minute. In memory, which is right for the
 * one-container deployment. Entries whose newest hit has left the window
 * are swept at most once a window, so the map holds only tokens used in
 * roughly the last two minutes.
 */
const hitsByToken = new Map<string, number[]>();
let lastSweep = 0;

function takeSlot(tokenId: string, now: number): boolean {
  if (now - lastSweep > RATE_WINDOW_MS) {
    for (const [id, hits] of hitsByToken) {
      if (!hits.length || hits[hits.length - 1]! <= now - RATE_WINDOW_MS) hitsByToken.delete(id);
    }
    lastSweep = now;
  }
  const { allowed, hits } = takeRateSlot(hitsByToken.get(tokenId) ?? [], now, RATE_LIMIT, RATE_WINDOW_MS);
  hitsByToken.set(tokenId, hits);
  return allowed;
}

/**
 * One module's tools, registered only while this token reaches that module.
 * `list_projects` serves both project-scoped modules, so it is registered
 * once for either. Task 6 adds the Docs tools here.
 */
function buildServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: 't-timeline', version: '1.0.0' });
  const list = hasModule(ctx.grants, 'list');
  if (list || hasModule(ctx.grants, 'docs')) registerProjectTools(server, ctx);
  if (list) registerListTools(server, ctx);
  if (hasModule(ctx.grants, 'wiki')) registerWikiTools(server, ctx);
  return server;
}

/** POST /api/mcp. */
export async function handleMcp(req: Request): Promise<Response> {
  const auth = await resolveBearer(req.headers.get('authorization'));
  if (!auth) return json({ error: 'invalid_token' }, 401, { 'WWW-Authenticate': 'Bearer' });
  if (!takeSlot(auth.tokenId, Date.now())) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(RATE_WINDOW_MS / 1000) });
  }

  const server = buildServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
