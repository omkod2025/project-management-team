import 'server-only';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { docAssetDeletions, docAssetRemovals, docAssets, docPages, docs, docTemplates, nodes } from '@/db/schema';
import { docAssetStorageKey } from '@/lib/doc-asset-path';
import { docAssetIds, removedDocAssetIds } from '@/lib/doc-asset-references';
import { domainError } from '@/lib/errors';

export type AssetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Every writer of asset references takes this lock before document/node locks.
export async function lockAssetReferences(tx: AssetTransaction, projectId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 571))`);
}

export async function validateAddedAssets(tx: AssetTransaction, projectId: string, before: unknown, after: unknown) {
  const previous = docAssetIds(before);
  const added = [...docAssetIds(after)].filter(id => !previous.has(id));
  if (!added.length) return;
  const assets = await tx.select({ id: docAssets.id }).from(docAssets)
    .where(and(eq(docAssets.projectId, projectId), inArray(docAssets.id, added)));
  if (assets.length !== added.length) throw domainError('E_INVALID_DOC', 'A linked file was deleted or is unavailable in this project. Upload it again before saving.');
}

/** Autosave records candidates only; it never removes a registry row or file. */
export async function stageRemovedAssets(tx: AssetTransaction, projectId: string, pageId: string, before: unknown, after: unknown) {
  const removed = removedDocAssetIds(before, after);
  if (!removed.length) return;
  const assets = await tx.select({ id: docAssets.id }).from(docAssets).where(and(eq(docAssets.projectId, projectId), inArray(docAssets.id, removed)));
  if (assets.length) await tx.insert(docAssetRemovals).values(assets.map(asset => ({ pageId, assetId: asset.id }))).onConflictDoNothing();
}

/** Also track uploads removed before they ever reach an autosaved document. */
export async function stageUploadedAssets(tx: AssetTransaction, projectId: string, pageId: string, userId: string, uploaded: unknown) {
  const ids = [...docAssetIds(uploaded)];
  if (!ids.length) return;
  if (ids.length > 1000) throw domainError('E_INVALID_DOC', 'Too many uploaded files in this edit.');
  const assets = await tx.select({ id: docAssets.id }).from(docAssets).where(and(
    eq(docAssets.projectId, projectId), eq(docAssets.uploaderId, userId), inArray(docAssets.id, ids),
  ));
  if (assets.length) await tx.insert(docAssetRemovals).values(assets.map(asset => ({ pageId, assetId: asset.id }))).onConflictDoNothing();
}

/** Explicit Done editing, after saving content in the same transaction. */
export async function finalizeRemovedAssets(tx: AssetTransaction, projectId: string, pageId: string) {
  const candidates = await tx.select({ id: docAssetRemovals.assetId }).from(docAssetRemovals).where(eq(docAssetRemovals.pageId, pageId));
  if (!candidates.length) return;
  const assets = await tx.select().from(docAssets).where(and(eq(docAssets.projectId, projectId), inArray(docAssets.id, candidates.map(item => item.id))));
  if (!assets.length) return;
  // Archived pages/tasks remain restorable. Revision history alone does not
  // retain files after an explicit removal from the current document.
  const pages = await tx.select({ content: docPages.content, settings: docPages.settings }).from(docPages)
    .innerJoin(docs, eq(docs.id, docPages.docId)).where(eq(docs.projectId, projectId));
  const templates = await tx.select({ content: docTemplates.content }).from(docTemplates).where(eq(docTemplates.projectId, projectId));
  const tasks = await tx.select({ values: nodes.customValues }).from(nodes).where(eq(nodes.projectId, projectId));
  // Another page may have autosaved its removal without pressing Done yet.
  // Keep that page's Undo window open until it finalizes its own edit.
  const otherDrafts = await tx.select({ id: docAssetRemovals.assetId }).from(docAssetRemovals)
    .innerJoin(docPages, eq(docPages.id, docAssetRemovals.pageId)).innerJoin(docs, eq(docs.id, docPages.docId))
    .where(and(eq(docs.projectId, projectId), ne(docAssetRemovals.pageId, pageId)));
  // Conservative retention also covers an asset ID quoted in document text.
  const references = JSON.stringify([pages, templates, tasks, otherDrafts]).toLowerCase();
  for (const asset of assets) {
    if (references.includes(asset.id.toLowerCase())) continue;
    await tx.insert(docAssetDeletions).values({ id: asset.id, projectId, filename: asset.filename, createdAt: asset.createdAt }).onConflictDoNothing();
    await tx.delete(docAssets).where(eq(docAssets.id, asset.id));
  }
  await tx.delete(docAssetRemovals).where(eq(docAssetRemovals.pageId, pageId));
}

/** Run only after Done commits. Failures retry on the next Done editing. */
export async function deleteQueuedAssets(projectId: string): Promise<number> {
  try { return await processQueuedAssets(projectId); }
  catch (error) {
    // A successful page save must not become a false save failure if cleanup
    // cannot reach the database. Its committed queue entries remain retryable.
    console.error('Document asset cleanup will retry', projectId, error);
    return 1;
  }
}

async function processQueuedAssets(projectId: string): Promise<number> {
  const pending = await db.select().from(docAssetDeletions).where(eq(docAssetDeletions.projectId, projectId));
  let remaining = 0;
  for (const asset of pending) {
    try {
      const root = path.resolve(/* turbopackIgnore: true */ process.env.DOC_ASSET_DIR || 'data/doc-assets');
      for (const key of [docAssetStorageKey(asset), asset.id]) {
        try { await unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root, key)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      await db.delete(docAssetDeletions).where(eq(docAssetDeletions.id, asset.id));
    } catch (error) {
      remaining++;
      console.error('Document asset deletion remains queued', asset.id, error);
    }
  }
  return remaining;
}
