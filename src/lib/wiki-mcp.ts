import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { wikiPages, wikis } from '@/db/schema';
import { contentMarkdown } from '@/lib/doc-rich-content';
import { activeWikiPages, searchWikiIds, type WikiPage } from '@/lib/wiki';
import { isUuid, pageBreadcrumb, takeRateSlot } from '@/lib/wiki-rules';
import { resolveBearer } from '@/lib/wiki-tokens';

/**
 * The wiki's MCP endpoint (spec §7): the only way AI reaches the wiki, and
 * read-only. Authentication is the Bearer token alone — cookies are never
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
  if (typeof wikiId !== 'string' || !isUuid(wikiId) || !wikiIds.includes(wikiId)) throw outOfScope();
  const [wiki] = await liveWikis([wikiId]);
  if (!wiki) throw outOfScope();
  return wiki;
}

const treeEntry = (p: WikiPage) => ({
  id: p.id, slug: p.slug, title: p.title, depth: p.depth, parentId: p.parentId, updatedAt: p.updatedAt,
});

async function readPage(
  wikiIds: readonly string[],
  args: { page_id?: string; wiki_id?: string; slug?: string },
) {
  let wikiId: unknown = args.wiki_id;
  if (args.page_id !== undefined) {
    if (!isUuid(args.page_id)) throw outOfScope();
    const [row] = await db.select({ wikiId: wikiPages.wikiId }).from(wikiPages)
      .where(and(eq(wikiPages.id, args.page_id), isNull(wikiPages.archivedAt))).limit(1);
    if (!row) throw outOfScope();
    wikiId = row.wikiId;
  } else if (typeof args.slug !== 'string') {
    throw outOfScope();
  }
  const wiki = await liveWiki(wikiIds, wikiId);
  const pages = await activeWikiPages(wiki.id);
  const page = args.page_id !== undefined
    ? pages.find((p) => p.id === args.page_id)
    : pages.find((p) => p.slug === args.slug);
  if (!page) throw outOfScope();
  return {
    title: page.title,
    wikiTitle: wiki.title,
    breadcrumb: pageBreadcrumb(pages, page.id),
    updatedAt: page.updatedAt,
    markdown: contentMarkdown(page.body),
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
    if (err instanceof OutOfScope) return { content: [{ type: 'text', text: NOT_FOUND }], isError: true };
    console.error(`[mcp] ${name} failed`, err);
    return { content: [{ type: 'text', text: 'The wiki could not answer this request.' }], isError: true };
  }
}

const readOnly = { readOnlyHint: true } as const;

function buildServer(wikiIds: readonly string[]): McpServer {
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
    description: 'Read one page as Markdown (Mermaid diagrams as ```mermaid fences). Give page_id, or wiki_id and slug.',
    inputSchema: {
      page_id: z.string().optional().describe('A page id from list_pages or search.'),
      wiki_id: z.string().optional().describe('With slug: the wiki the page is in.'),
      slug: z.string().optional().describe('With wiki_id: the page slug.'),
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

  return server;
}

/** POST /api/mcp. */
export async function handleMcp(req: Request): Promise<Response> {
  const auth = await resolveBearer(req.headers.get('authorization'));
  if (!auth) return json({ error: 'invalid_token' }, 401, { 'WWW-Authenticate': 'Bearer' });
  if (!takeSlot(auth.tokenId, Date.now())) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(RATE_WINDOW_MS / 1000) });
  }

  const server = buildServer(auth.wikiIds);
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
