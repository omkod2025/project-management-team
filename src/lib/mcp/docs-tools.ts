import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { docPages, docs } from '@/db/schema';
import { createDoc, createDocPage, listDocs, loadDoc, requirePage, saveDocPage } from '@/lib/docs';
import { pageSections, type DocPage } from '@/lib/doc-rules';
import { contentMarkdown, decodeRich } from '@/lib/doc-rich-content';
import { domainError } from '@/lib/errors';
import { hasGrant, isUuid } from '@/lib/token-rules';
import { docPageContent, scopedId } from '@/lib/mcp-rules';
import { answer, outOfScope, readOnly, writes, type McpContext } from './tool-kit';

/**
 * The project Docs module's tools (central MCP tokens design, Task 6). Reads
 * are on for any token that reaches Docs; each write is registered only when
 * its grant is held. Every id is resolved to its project and checked against
 * the token's scope first, so a malformed, unknown or out-of-scope id is the
 * same "Not found."; `docs.ts` then enforces the owner's role (`doc.create`,
 * `doc.edit`), protected pages and linked titles, as the app's routes do.
 *
 * MCP creates Free pages only, and an edit never finalises or uploads files:
 * removing a file from a page stays an act in the app (`docPageContent`).
 */

const toPage = (p: DocPage) => ({
  id: p.id, title: p.title, slug: p.slug, depth: p.depth, parentId: p.parentId,
  template: p.template, protected: p.protected ?? false, updatedAt: p.updatedAt,
});

/** A project the token scopes; `docs.ts` checks it is live and visible to the owner. */
function scopedProject(ctx: McpContext, raw: unknown): string {
  const projectId = scopedId(ctx.scope.projectIds, raw);
  if (!projectId) throw outOfScope();
  return projectId;
}

/** A live doc in a project the token scopes, or "Not found.". */
async function scopedDoc(ctx: McpContext, raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !isUuid(raw)) throw outOfScope();
  const [doc] = await db.select({ id: docs.id, projectId: docs.projectId }).from(docs)
    .where(and(eq(docs.id, raw.toLowerCase()), isNull(docs.archivedAt))).limit(1);
  if (!doc || !scopedId(ctx.scope.projectIds, doc.projectId)) throw outOfScope();
  return doc.id;
}

/** A live page whose doc sits in a project the token scopes, or "Not found.". */
async function scopedPage(ctx: McpContext, raw: unknown): Promise<{ id: string; docId: string }> {
  if (typeof raw !== 'string' || !isUuid(raw)) throw outOfScope();
  const [page] = await db.select({ id: docPages.id, docId: docPages.docId, projectId: docs.projectId })
    .from(docPages).innerJoin(docs, eq(docs.id, docPages.docId))
    .where(and(eq(docPages.id, raw.toLowerCase()), isNull(docPages.archivedAt), isNull(docs.archivedAt))).limit(1);
  if (!page || !scopedId(ctx.scope.projectIds, page.projectId)) throw outOfScope();
  return page;
}

async function readPage(ctx: McpContext, args: { page_id: string; include_rich_content?: boolean }) {
  const { id, docId } = await scopedPage(ctx, args.page_id);
  const { doc, pages } = await loadDoc(ctx.ownerId, docId);
  const page = pages.find((p) => p.id === id);
  if (!page) throw outOfScope();
  const keys = pageSections(page.template).map(([key]) => key);
  const text = (key: string) => page.content[key] ?? '';
  return {
    title: page.title, docTitle: doc.title, template: page.template, updatedAt: page.updatedAt,
    sections: Object.fromEntries(keys.map((key) => [key, contentMarkdown(text(key))])),
    ...(args.include_rich_content
      ? { rich_content: Object.fromEntries(keys.map((key) => [key, decodeRich(text(key)) ? text(key) : null])) }
      : {}),
  };
}

async function createPage(ctx: McpContext, args: { doc_id: string; title: string; markdown?: string; parent_id?: string }) {
  const docId = await scopedDoc(ctx, args.doc_id);
  const page = await createDocPage(ctx.ownerId, docId, {
    template: 'free', title: args.title, parentId: args.parent_id,
    content: args.markdown === undefined ? undefined : { body: args.markdown },
  });
  return { id: page.id, title: page.title, slug: page.slug, depth: page.depth, parentId: page.parentId,
    template: page.template, updatedAt: page.updatedAt };
}

type UpdateArgs = { page_id: string; section?: string; markdown?: string; rich_content?: string; title?: string; updatedAt: string };

/**
 * One section rewritten, against the `updatedAt` the caller last read. A stale
 * one is refused before the content is weighed, so the caller is told to
 * reread rather than about a file link someone else added since.
 */
async function updatePage(ctx: McpContext, args: UpdateArgs) {
  const { id } = await scopedPage(ctx, args.page_id);
  const { page } = await requirePage(ctx.ownerId, id);
  if (page.updatedAt.toISOString() !== args.updatedAt) {
    throw domainError('E_DOC_CONFLICT', 'This page changed since it was read.');
  }
  const content = docPageContent(page.content, page.template, args);
  return saveDocPage(ctx.ownerId, id, { content, title: args.title, updatedAt: args.updatedAt });
}

export function registerDocsTools(server: McpServer, ctx: McpContext): void {
  server.registerTool('list_docs', {
    description: 'Every document in one project: id, title, version, createdByName, updatedAt.',
    inputSchema: z.object({ project_id: z.string().describe('A project id from list_projects.') }).strict(),
    annotations: readOnly,
  }, ({ project_id }) => answer('list_docs', () => listDocs(ctx.ownerId, scopedProject(ctx, project_id))));

  server.registerTool('list_doc_pages', {
    description: 'The pages of one document, in reading order: id, title, slug, depth (1–3), parentId, template (free or module), protected, updatedAt.',
    inputSchema: z.object({ doc_id: z.string().describe('A document id from list_docs.') }).strict(),
    annotations: readOnly,
  }, ({ doc_id }) => answer('list_doc_pages', async () =>
    (await loadDoc(ctx.ownerId, await scopedDoc(ctx, doc_id))).pages.map(toPage)));

  server.registerTool('read_doc_page', {
    description: 'Read one page: title, docTitle, template, updatedAt and sections (section key → Markdown; a Free page has only body, a Module page has description, wantFeature, decisions, currentScope, nextPhase). Request include_rich_content for lossless rich editing; a section’s rich_content is null when it is plain Markdown.',
    inputSchema: z.object({
      page_id: z.string().describe('A page id from list_doc_pages.'),
      include_rich_content: z.boolean().optional(),
    }).strict(),
    annotations: readOnly,
  }, (args) => answer('read_doc_page', () => readPage(ctx, args)));

  if (hasGrant(ctx.grants, 'docs', 'create_doc')) server.registerTool('create_doc', {
    description: 'Create a document in a project. Retrying may create another document.',
    inputSchema: z.object({ project_id: z.string(), title: z.string() }).strict(),
    annotations: writes,
  }, ({ project_id, title }) => answer('create_doc', () => createDoc(ctx.ownerId, scopedProject(ctx, project_id), { title })));

  if (hasGrant(ctx.grants, 'docs', 'create_page')) server.registerTool('create_doc_page', {
    description: 'Create a Free page in a document, optionally under parent_id (pages nest three levels) and with Markdown as its body. Retrying may create another page.',
    inputSchema: z.object({ doc_id: z.string(), title: z.string(), markdown: z.string().optional(), parent_id: z.string().optional() }).strict(),
    annotations: writes,
  }, (args) => answer('create_doc_page', () => createPage(ctx, args)));

  if (hasGrant(ctx.grants, 'docs', 'write_page')) server.registerTool('update_doc_page', {
    description: 'Rewrite one section of a page (section defaults to body) with exactly one of markdown or rich_content, and optionally retitle it. Other sections are kept. Supply the updatedAt from read_doc_page; reread on conflict. Rich sections need rich_content from read_doc_page include_rich_content. An edit may not remove a file link, and protected pages cannot be edited.',
    inputSchema: z.object({
      page_id: z.string(),
      section: z.string().optional(),
      markdown: z.string().optional(),
      rich_content: z.string().optional(),
      title: z.string().optional(),
      updatedAt: z.string(),
    }).strict(),
    annotations: { ...writes, destructiveHint: true },
  }, (args) => answer('update_doc_page', () => updatePage(ctx, args)));
}
