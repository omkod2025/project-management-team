import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { wikiPages, wikis } from '@/db/schema';
import { domainError } from '@/lib/errors';
import { createWikiForToken, createWikiPage, requireWiki, saveWikiPage } from '@/lib/wiki';
import { isUuid, parseWikiUpdate, type WikiTokenPermission } from '@/lib/wiki-rules';

export type McpWriteContext = {
  tokenId: string;
  ownerId: string;
  wikiIds: readonly string[];
  permissions: readonly WikiTokenPermission[];
};

const notFound = () => domainError('E_NOT_FOUND', 'Not found.');

function grant(ctx: McpWriteContext, permission: WikiTokenPermission) {
  if (!ctx.permissions.includes(permission)) throw domainError('E_FORBIDDEN', 'This token does not grant this operation.');
}

async function targetWiki(ctx: McpWriteContext, id: string, need: 'write' | 'manage') {
  if (!isUuid(id) || !ctx.wikiIds.includes(id.toLowerCase())) throw notFound();
  // Check archived before role-dependent errors so it never reveals an archived target.
  const [row] = await db.select({ id: wikis.id }).from(wikis)
    .where(and(eq(wikis.id, id.toLowerCase()), isNull(wikis.archivedAt))).limit(1);
  if (!row) throw notFound();
  return requireWiki(ctx.ownerId, row.id, need);
}

export async function createMcpWiki(ctx: McpWriteContext, input: { title: string; description?: string }) {
  grant(ctx, 'create_wiki');
  const wiki = await createWikiForToken(ctx.ownerId, ctx.tokenId, input);
  return { id: wiki.id, title: wiki.title, description: wiki.description };
}

export async function createMcpPage(ctx: McpWriteContext, input: {
  wiki_id: string; title: string; markdown: string; parent_id?: string; slug?: string;
}) {
  grant(ctx, 'create_page');
  const { wiki } = await targetWiki(ctx, input.wiki_id, 'write');
  const page = await createWikiPage(ctx.ownerId, wiki.id, {
    title: input.title, body: input.markdown, parentId: input.parent_id, slug: input.slug,
  });
  return { id: page.id, wikiId: wiki.id, slug: page.slug, title: page.title, updatedAt: page.updatedAt };
}

export async function updateMcpWiki(ctx: McpWriteContext, input: { wiki_id: string; title?: string; description?: string }) {
  grant(ctx, 'write_wiki');
  const { wiki } = await targetWiki(ctx, input.wiki_id, 'manage');
  if (input.title === undefined && input.description === undefined) {
    throw domainError('E_INVALID_DOC', 'Provide a title or description to update.');
  }
  // Validate the complete patch first, then write both values in a single statement.
  const title = input.title === undefined ? undefined : parseWikiUpdate({ action: 'rename', title: input.title });
  const description = input.description === undefined ? undefined : parseWikiUpdate({ action: 'describe', description: input.description });
  const [saved] = await db.update(wikis).set({
    ...(title?.action === 'rename' ? { title: title.title } : {}),
    ...(description?.action === 'describe' ? { description: description.description } : {}),
    updatedAt: new Date(),
  }).where(and(eq(wikis.id, wiki.id), isNull(wikis.archivedAt)))
    .returning({ id: wikis.id, title: wikis.title, description: wikis.description });
  if (!saved) throw notFound();
  return saved;
}

export async function updateMcpPage(ctx: McpWriteContext, input: {
  page_id: string; markdown: string; updatedAt: string; title?: string;
}) {
  grant(ctx, 'write_wiki');
  if (!isUuid(input.page_id)) throw notFound();
  const id = input.page_id.toLowerCase();
  const [page] = await db.select({ wikiId: wikiPages.wikiId }).from(wikiPages)
    .where(and(eq(wikiPages.id, id), isNull(wikiPages.archivedAt))).limit(1);
  if (!page) throw notFound();
  await targetWiki(ctx, page.wikiId, 'write');
  const saved = await saveWikiPage(ctx.ownerId, id, {
    content: { body: input.markdown }, title: input.title, updatedAt: input.updatedAt,
  });
  return { id, title: saved.title, updatedAt: saved.updatedAt };
}
