import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { wikiPages, wikis } from '@/db/schema';
import { contentMarkdown, decodeRich } from '@/lib/doc-rich-content';
import { activeWikiPages, searchWikiIds, type WikiPage } from '@/lib/wiki';
import { isUuid, pageBreadcrumb, takeRateSlot } from '@/lib/wiki-rules';
import { DomainError } from '@/lib/errors';
import { createMcpWiki, createMcpPage, updateMcpWiki, updateMcpPage, type McpWriteContext } from '@/lib/wiki-mcp-writes';
import { resolveBearer } from '@/lib/wiki-tokens';

/**
 * The wiki's MCP endpoint (spec §7): the only way AI reaches the wiki, and
 * optionally writable under explicit token grants. Authentication is the Bearer token alone — cookies are never
 * read here, and a session cannot reach this code path.
 *
 * Every lookup is filtered to the token's effective wikis, resolved fresh on
 * this request (scope ∩ what the owner can see now), and to wikis and pages
 * that are not archived. Anything outside that is "Not found." — the same
 * answer as an id that never existed (spec §8, existence leaks).
 */

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const MAX_SEARCH = 20;
const NOT_FOUND = 'Not found.';

/**
 * Per-token hit times for the last minute. In memory, which is right for the
 * one-container deployment (spec §7). Entries whose newest hit has left the
 * window are swept at most once a window, so the map holds only tokens used
 * in roughly the last two minutes.
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

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/* ------------------------------------------------------------ the reads */

class OutOfScope extends Error {}
const outOfScope = () => new OutOfScope(NOT_FOUND);

type LiveWiki = { id: string; title: string; description: string; pageCount: number };

/** The effective wikis that are not archived, with their live page counts. No session logic: `wikiIds` is taken as given. */
async function liveWikis(wikiIds: readonly string[]): Promise<LiveWiki[]> {
  if (!wikiIds.length) return [];
  return db.select({
    id: wikis.id,
    title: wikis.title,
    description: wikis.description,
    pageCount: sql<number>`(
      SELECT count(*)::int FROM pmt_wiki_pages p
       WHERE p.wiki_page_wiki_id = ${wikis.id} AND p.wiki_page_archived_at IS NULL
    )`,
  }).from(wikis)
    .where(and(inArray(wikis.id, [...wikiIds]), isNull(wikis.archivedAt)))
    .orderBy(wikis.title, wikis.id);
}

/** One wiki from the live effective set, or "Not found." for anything else — malformed ids included. */
async function liveWiki(wikiIds: readonly string[], wikiId: unknown): Promise<LiveWiki> {
  if (typeof wikiId !== 'string' || !isUuid(wikiId)) throw outOfScope();
  // A UUID is case-insensitive; the set and the database hold lowercase.
  const id = wikiId.toLowerCase();
  if (!wikiIds.includes(id)) throw outOfScope();
  const [wiki] = await liveWikis([id]);
  if (!wiki) throw outOfScope();
  return wiki;
}

const treeEntry = (p: WikiPage) => ({
  id: p.id, slug: p.slug, title: p.title, depth: p.depth, parentId: p.parentId, updatedAt: p.updatedAt,
});

async function readPage(
  wikiIds: readonly string[],
  args: { page_id?: string; wiki_id?: string; slug?: string; include_rich_content?: boolean },
) {
  let wikiId: unknown = args.wiki_id;
  const pageId = typeof args.page_id === 'string' ? args.page_id.toLowerCase() : args.page_id;
  if (pageId !== undefined) {
    if (!isUuid(pageId)) throw outOfScope();
    const [row] = await db.select({ wikiId: wikiPages.wikiId }).from(wikiPages)
      .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.archivedAt))).limit(1);
    if (!row) throw outOfScope();
    wikiId = row.wikiId;
  } else if (typeof args.slug !== 'string') {
    throw outOfScope();
  }
  const wiki = await liveWiki(wikiIds, wikiId);
  const pages = await activeWikiPages(wiki.id);
  const page = pageId !== undefined
    ? pages.find((p) => p.id === pageId)
    : pages.find((p) => p.slug === args.slug);
  if (!page) throw outOfScope();
  return {
    title: page.title,
    wikiTitle: wiki.title,
    breadcrumb: pageBreadcrumb(pages, page.id),
    updatedAt: page.updatedAt,
    markdown: contentMarkdown(page.body),
    ...(args.include_rich_content ? { rich_content: decodeRich(page.body) ? page.body : null } : {}),
  };
}

async function search(wikiIds: readonly string[], args: { query: string; wiki_id?: string; limit?: number }) {
  const ids = args.wiki_id !== undefined
    ? [(await liveWiki(wikiIds, args.wiki_id)).id]
    : (await liveWikis(wikiIds)).map((w) => w.id);
  // searchWikiIds widens 0 to its default, so the clamp to 1..20 happens here.
  const limit = Math.min(MAX_SEARCH, Math.max(1, Math.trunc(args.limit ?? MAX_SEARCH) || 1));
  return searchWikiIds(ids, args.query, limit);
}

/* ------------------------------------------------------------- the server */

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/**
 * Runs one tool body. "Not found." for anything out of scope; any other
 * failure is logged here and reported to the client without its message, so
 * no stack trace or database text crosses the wire.
 */
async function answer(name: string, run: () => Promise<unknown>): Promise<ToolResult> {
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
    return { content: [{ type: 'text', text: 'The wiki could not answer this request.' }], isError: true };
  }
}

const readOnly = { readOnlyHint: true } as const;

function buildServer(ctx: McpWriteContext): McpServer {
  const { wikiIds, permissions } = ctx;
  const server = new McpServer({ name: 't-timeline-wiki', version: '1.0.0' });

  server.registerTool('list_wikis', {
    description: 'List the wikis this token can read: id, title, description and number of pages.',
    annotations: readOnly,
  }, () => answer('list_wikis', () => liveWikis(wikiIds)));

  server.registerTool('list_pages', {
    description: 'The page tree of one wiki: id, slug, title, depth (1-3), parentId and updatedAt, in tree order.',
    inputSchema: { wiki_id: z.string().describe('A wiki id from list_wikis.') },
    annotations: readOnly,
  }, ({ wiki_id }) => answer('list_pages', async () => {
    const wiki = await liveWiki(wikiIds, wiki_id);
    return (await activeWikiPages(wiki.id)).map(treeEntry);
  }));

  server.registerTool('read_page', {
    description: 'Read one page as Markdown (Mermaid diagrams as ```mermaid fences). Give page_id, or wiki_id and slug. Request include_rich_content for lossless rich editing; rich_content is null on plain Markdown pages.',
    inputSchema: {
      page_id: z.string().optional().describe('A page id from list_pages or search.'),
      wiki_id: z.string().optional().describe('With slug: the wiki the page is in.'),
      slug: z.string().optional().describe('With wiki_id: the page slug.'),
      include_rich_content: z.boolean().optional().describe('Include canonical fieldbook-rich-v1 content for lossless edits. Default read response is unchanged.'),
    },
    annotations: readOnly,
  }, (args) => answer('read_page', () => readPage(wikiIds, args)));

  server.registerTool('search', {
    description: 'Search page titles and text. Every whitespace-separated term must match; Thai works mid-word. Returns pageId, title, wikiTitle, snippet and rank.',
    inputSchema: {
      query: z.string().describe('Search terms.'),
      wiki_id: z.string().optional().describe('Limit to one wiki.'),
      limit: z.number().optional().describe('At most 20 results (default 20).'),
    },
    annotations: readOnly,
  }, (args) => answer('search', () => search(wikiIds, args)));

  const writes = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
  if (permissions.includes('create_wiki')) server.registerTool('create_wiki', {
    description: 'Create a wiki owned by this token owner and add it to this token scope. Retrying may create another wiki.',
    inputSchema: z.object({ title: z.string(), description: z.string().optional() }).strict(),
    annotations: writes,
  }, (args) => answer('create_wiki', () => createMcpWiki(ctx, args)));
  if (permissions.includes('create_page')) server.registerTool('create_page', {
    description: 'Create a page with initial Markdown in a scoped wiki you can write. Retrying may create another page.',
    inputSchema: z.object({ wiki_id: z.string(), title: z.string(), markdown: z.string(), parent_id: z.string().optional(), slug: z.string().optional() }).strict(),
    annotations: writes,
  }, (args) => answer('create_page', () => createMcpPage(ctx, args)));
  if (permissions.includes('write_wiki')) {
    server.registerTool('update_wiki', {
      description: 'Update only wiki title or description. Requires this token owner to manage the scoped wiki. Empty description clears it.',
      inputSchema: z.object({ wiki_id: z.string(), title: z.string().optional(), description: z.string().optional() }).strict(),
      annotations: { ...writes, destructiveHint: true },
    }, (args) => answer('update_wiki', () => updateMcpWiki(ctx, args)));
    server.registerTool('update_page', {
      description: 'Update a page with exactly one of markdown or rich_content and optional title. For existing rich pages use read_page include_rich_content and edit that canonical string; changed Markdown cannot flatten rich content. Supply latest updatedAt; reread on conflict.',
      inputSchema: z.object({ page_id: z.string(), markdown: z.string().optional(), rich_content: z.string().optional(), title: z.string().optional(), updatedAt: z.string() }).strict(),
      annotations: { ...writes, destructiveHint: true },
    }, (args) => answer('update_page', () => updateMcpPage(ctx, args)));
  }
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
