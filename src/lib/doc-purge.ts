import 'server-only';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { docAssetRemovals, docPages, docs, users } from '@/db/schema';
import { authorize, requireProjectRole } from '@/lib/permissions';
import { domainError } from '@/lib/errors';
import { deleteQueuedAssets, lockAssetReferences, releaseUnreferencedAssets, type AssetTransaction } from '@/lib/doc-asset-cleanup';
import { docAssetIds } from '@/lib/doc-asset-references';
import { pagePurgeOrder, type ArchivedDocSummary, type DocSummary } from '@/lib/doc-rules';
import { requireDoc } from '@/lib/docs';

/*
 * Permanent deletion (D-61, updated 2026-11-12). Deleting is still archival;
 * this is the second, deliberate step for what already sits in Deleted pages
 * or Deleted documents. Admin only — the capability that deletes and restores.
 *
 * Revisions, comments and pending file removals cascade with a page row, and a
 * published link is a column on it, so they go too. Uploaded files are shared
 * across the project: one is deleted only when nothing left still names it.
 */

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function pageIdFrom(input: unknown): string {
  const pageId = input && typeof input === 'object' ? (input as { pageId?: unknown }).pageId : undefined;
  if (typeof pageId !== 'string' || !UUID.test(pageId)) throw domainError('E_INVALID_DOC', 'Choose a deleted page.');
  return pageId;
}

/** A document in Deleted documents, for an admin of its project. */
async function requireArchivedDoc(userId: string, id: string) {
  if (!UUID.test(id)) throw domainError('E_NOT_FOUND', 'No such deleted document.');
  const [doc] = await db.select().from(docs).where(and(eq(docs.id, id), isNotNull(docs.archivedAt))).limit(1);
  if (!doc) throw domainError('E_NOT_FOUND', 'No such deleted document.');
  await requireProjectRole(userId, doc.projectId, 'read');
  await authorize(userId, doc.projectId, 'doc.create');
  return doc;
}

/** Delete the given pages deepest first, collecting every file they named. */
async function deletePages(tx: AssetTransaction, ids: readonly string[]) {
  if (!ids.length) return [];
  const rows = await tx.select({ id: docPages.id, content: docPages.content, settings: docPages.settings })
    .from(docPages).where(inArray(docPages.id, [...ids]));
  const pending = await tx.select({ id: docAssetRemovals.assetId }).from(docAssetRemovals)
    .where(inArray(docAssetRemovals.pageId, [...ids]));
  const files = [...rows.flatMap((r) => [...docAssetIds(r.content), ...docAssetIds(r.settings)]), ...pending.map((p) => p.id)];
  for (const id of ids) await tx.delete(docPages).where(eq(docPages.id, id));
  return files;
}

export async function listArchivedDocs(userId: string, projectId: string): Promise<ArchivedDocSummary[]> {
  await authorize(userId, projectId, 'doc.create');
  const rows = await db.select({ id: docs.id, title: docs.title, version: docs.version, archivedAt: docs.archivedAt })
    .from(docs).where(and(eq(docs.projectId, projectId), isNotNull(docs.archivedAt)))
    .orderBy(desc(docs.archivedAt), docs.id);
  return rows.map((r) => ({ ...r, archivedAt: r.archivedAt!.toISOString() }));
}

/** Bring a deleted document back; its pages keep their own deleted or live state. */
export async function restoreDoc(userId: string, id: string): Promise<DocSummary> {
  const doc = await requireArchivedDoc(userId, id);
  const [row] = await db.update(docs).set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(docs.id, doc.id), isNotNull(docs.archivedAt))).returning();
  if (!row) throw domainError('E_NOT_FOUND', 'No such deleted document.');
  const [creator] = row.createdBy ? await db.select({ name: users.fullName }).from(users).where(eq(users.id, row.createdBy)) : [];
  return { id: row.id, title: row.title, version: row.version, createdByName: creator?.name ?? null, updatedAt: row.updatedAt.toISOString() };
}

/** Permanently delete an archived page and the pages under it. */
export async function purgeDocPage(userId: string, docId: string, input: unknown): Promise<{ deleted: number }> {
  const doc = await requireDoc(userId, docId);
  await authorize(userId, doc.projectId, 'doc.create');
  const pageId = pageIdFrom(input);
  const deleted = await db.transaction(async (tx) => {
    await lockAssetReferences(tx, doc.projectId);
    await tx.select({ id: docs.id }).from(docs).where(eq(docs.id, doc.id)).for('update');
    const pages = await tx.select({ id: docPages.id, parentId: docPages.parentId, depth: docPages.depth, archivedAt: docPages.archivedAt })
      .from(docPages).where(eq(docPages.docId, doc.id));
    const order = pagePurgeOrder(pages.map((p) => ({ ...p, archived: Boolean(p.archivedAt) })), pageId);
    const files = await deletePages(tx, order);
    await releaseUnreferencedAssets(tx, doc.projectId, files);
    return order.length;
  });
  await deleteQueuedAssets(doc.projectId);
  return { deleted };
}

/** Permanently delete an archived document with every page it holds. */
export async function purgeDoc(userId: string, id: string): Promise<{ ok: true }> {
  const doc = await requireArchivedDoc(userId, id);
  await db.transaction(async (tx) => {
    await lockAssetReferences(tx, doc.projectId);
    const [locked] = await tx.select({ id: docs.id }).from(docs)
      .where(and(eq(docs.id, doc.id), isNotNull(docs.archivedAt))).for('update');
    if (!locked) throw domainError('E_NOT_FOUND', 'No such deleted document.');
    const pages = await tx.select({ id: docPages.id, depth: docPages.depth }).from(docPages).where(eq(docPages.docId, doc.id));
    const files = await deletePages(tx, [...pages].sort((a, b) => b.depth - a.depth).map((p) => p.id));
    await tx.delete(docs).where(eq(docs.id, doc.id));
    await releaseUnreferencedAssets(tx, doc.projectId, files);
  });
  await deleteQueuedAssets(doc.projectId);
  return { ok: true };
}
