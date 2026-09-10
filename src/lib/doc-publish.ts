import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { docPages, docs, projects } from '@/db/schema';
import { domainError } from '@/lib/errors';
import { docAssetIds } from '@/lib/doc-asset-references';
import { findDocAsset, readDocAssetBytes } from '@/lib/doc-assets';
import { isPublishToken } from '@/lib/doc-publish-rules';

/**
 * The unauthenticated read path for a published page (spec 10 §8b).
 *
 * Nothing in this file takes a user, which is the point and the danger. Two
 * habits keep it honest:
 *
 *   - **The token is checked for shape before it reaches the database**, and
 *     every refusal is the same `E_NOT_FOUND`. A stranger must not be able to
 *     tell a malformed token from a revoked one from a real page they cannot
 *     have.
 *   - **Nothing is selected that the page does not need.** No author, no
 *     project slug, no member list, no comments, no sibling pages, no revision
 *     history. A published page is a document, not a window into the project
 *     it came from — the safest way to keep it that way is not to load the
 *     rest in the first place.
 */

export type PublishedPage = {
  title: string;
  template: 'free' | 'module';
  content: Record<string, string>;
  updatedAt: string;
  publishedAt: string;
  /** The document's own title and version stamp; deliberately not the project's. */
  docTitle: string;
  docVersion: string;
  token: string;
  /** Assets this page references, and so the only ones the token may read. */
  assetIds: string[];
};

export async function loadPublishedPage(token: unknown): Promise<PublishedPage> {
  if (!isPublishToken(token)) throw domainError('E_NOT_FOUND', 'No such page.');

  const [row] = await db
    .select({
      title: docPages.title,
      template: docPages.template,
      content: docPages.content,
      updatedAt: docPages.updatedAt,
      publishedAt: docPages.publishedAt,
      docTitle: docs.title,
      docVersion: docs.version,
    })
    .from(docPages)
    .innerJoin(docs, eq(docs.id, docPages.docId))
    .innerJoin(projects, eq(projects.id, docs.projectId))
    .where(and(
      eq(docPages.publishToken, token),
      // A page that was archived, in a document that was archived, in a
      // project that was archived, is not published any more. Withdrawing the
      // container has to withdraw the link, or "archive it" quietly leaves a
      // public copy standing.
      isNull(docPages.archivedAt),
      isNull(docs.archivedAt),
      isNull(projects.archivedAt),
    ))
    .limit(1);

  if (!row || !row.publishedAt) throw domainError('E_NOT_FOUND', 'No such page.');

  return {
    title: row.title,
    template: row.template,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt.toISOString(),
    docTitle: row.docTitle,
    docVersion: row.docVersion,
    token,
    assetIds: [...docAssetIds(row.content)],
  };
}

/**
 * A file, for a reader who has no account.
 *
 * The token's right to it is proved from the page's own content: the asset id
 * must appear in the very page that token publishes. So a published page can
 * show its own pictures and nothing else — no traversal of the project's file
 * store, and `D-56`'s registry still records every file.
 */
export async function readPublishedAsset(token: unknown, assetId: string) {
  const page = await loadPublishedPage(token);
  if (!page.assetIds.includes(assetId.toLowerCase())) {
    throw domainError('E_NOT_FOUND', 'No such file.');
  }
  const asset = await findDocAsset(assetId);
  const { data } = await readDocAssetBytes(asset);
  return { data, mime: asset.mime, filename: asset.filename };
}
