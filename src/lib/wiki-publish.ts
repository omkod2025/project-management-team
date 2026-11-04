import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { wikis } from '@/db/schema';
import { domainError } from '@/lib/errors';
import { docAssetIds } from '@/lib/doc-asset-references';
import { isPublishToken } from '@/lib/doc-publish-rules';
import { activeWikiPages, updateWiki, type WikiPage } from '@/lib/wiki';
import { WIKI_ASSET_PREFIX } from '@/lib/wiki-asset-cleanup';
import { findWikiAsset, readWikiAssetBytes } from '@/lib/wiki-assets';

/**
 * The whole-wiki public link (wiki spec §5b), adapting the five rules of
 * Docs §8b:
 *
 *   - **The secret is the whole guard** — `publicWikiToken()`, 32 random
 *     bytes, checked for shape before it reaches the database.
 *   - **Revocation deletes the secret**, and publishing again mints a new one.
 *   - **Archiving withdraws the link.** Archiving already clears the token;
 *     the read path refuses an archived wiki anyway, so the two cannot drift.
 *   - **Assets are served through the token**, and only if a non-archived
 *     page of *that* wiki references them.
 *   - **Every refusal is the same `E_NOT_FOUND`**: a malformed token, a
 *     revoked one, an archived wiki or page and a slug that never existed are
 *     indistinguishable from outside.
 *
 * Nothing here takes a user on the read side. Nothing is selected that the
 * public page does not print: no owner, no members, no authors.
 */

const notFound = () => domainError('E_NOT_FOUND', 'No such page.');

/** Publish (owner or install admin). Returns the existing secret if there is one. */
export async function publishWiki(userId: string, wikiId: string): Promise<{ token: string }> {
  const summary = await updateWiki(userId, wikiId, { action: 'publish' });
  return { token: summary.publicToken! };
}

/** Revoke: the secret is deleted, and the next publish mints a different one. */
export async function unpublishWiki(userId: string, wikiId: string): Promise<void> {
  await updateWiki(userId, wikiId, { action: 'unpublish' });
}

export type PublishedWiki = {
  /** `id` is for rewriting this wiki's own page links; it is never printed. */
  wiki: { id: string; title: string };
  token: string;
  pages: WikiPage[];
};

export async function loadPublishedWiki(token: unknown): Promise<PublishedWiki> {
  if (!isPublishToken(token)) throw notFound();
  const [row] = await db.select({ id: wikis.id, title: wikis.title })
    .from(wikis)
    .where(and(eq(wikis.publicToken, token), isNull(wikis.archivedAt)))
    .limit(1);
  if (!row) throw notFound();
  return { wiki: row, token, pages: await activeWikiPages(row.id) };
}

export type PublishedWikiPage = PublishedWiki & {
  page: WikiPage;
  /** Assets this page references — the only ones its links are rewritten to. */
  assetIds: string[];
};

export async function loadPublishedWikiPage(token: unknown, slug: unknown): Promise<PublishedWikiPage> {
  const data = await loadPublishedWiki(token);
  const page = data.pages.find((p) => p.slug === slug);
  if (!page) throw notFound();
  return { ...data, page, assetIds: [...docAssetIds(page.body, WIKI_ASSET_PREFIX)] };
}

/**
 * A file, for a reader with no account. Its right is proved from content: a
 * non-archived page of the token's wiki must reference it, and the registry
 * row must belong to that wiki.
 */
export async function readPublishedWikiAsset(token: unknown, assetId: string) {
  const { wiki, pages } = await loadPublishedWiki(token);
  const id = assetId.toLowerCase();
  if (!pages.some((p) => docAssetIds(p.body, WIKI_ASSET_PREFIX).has(id))) {
    throw domainError('E_NOT_FOUND', 'No such file.');
  }
  const asset = await findWikiAsset(id);
  if (asset.wikiId !== wiki.id) throw domainError('E_NOT_FOUND', 'No such file.');
  return readWikiAssetBytes(asset);
}
