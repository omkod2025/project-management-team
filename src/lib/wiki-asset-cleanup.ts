import 'server-only';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { wikiAssetDeletions, wikiAssetRemovals, wikiAssets, wikiPages } from '@/db/schema';
import { docAssetStorageKey } from '@/lib/doc-asset-path';
import { docAssetIds, removedDocAssetIds } from '@/lib/doc-asset-references';
import { domainError } from '@/lib/errors';

/**
 * Wiki asset staging and cleanup: `doc-asset-cleanup.ts` on the wiki tables
 * (D-56, D-57 carried over). Autosave only records removal candidates; the
 * explicit Done editing finalizes them, and a file is unlinked only after
 * that commits. The Docs module is left alone — the two registries never
 * share a row, a lock key or a directory.
 */

export type WikiAssetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const WIKI_ASSET_PREFIX = '/api/wiki-assets/';

// Runtime-mounted mutable assets must not be bundled into the server output.
export const wikiAssetDirectory = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.WIKI_ASSET_DIR || 'data/wiki-assets');

const idsIn = (value: unknown) => docAssetIds(value, WIKI_ASSET_PREFIX);

// Every writer of wiki asset references takes this lock before page locks.
// 572, not Docs' 571, so a wiki and a project with the same uuid never contend.
export async function lockWikiAssetReferences(tx: WikiAssetTransaction, wikiId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${wikiId}, 572))`);
}

/** A body may only link files registered to its own wiki. */
export async function validateAddedWikiAssets(tx: WikiAssetTransaction, wikiId: string, before: unknown, after: unknown) {
  const previous = idsIn(before);
  const added = [...idsIn(after)].filter((id) => !previous.has(id));
  if (!added.length) return;
  const assets = await tx.select({ id: wikiAssets.id }).from(wikiAssets)
    .where(and(eq(wikiAssets.wikiId, wikiId), inArray(wikiAssets.id, added)));
  if (assets.length !== added.length) {
    throw domainError('E_INVALID_DOC', 'A linked file was deleted or is unavailable in this wiki. Upload it again before saving.');
  }
}

/** Autosave records candidates only; it never removes a registry row or file. */
export async function stageRemovedWikiAssets(tx: WikiAssetTransaction, wikiId: string, pageId: string, before: unknown, after: unknown) {
  const removed = removedDocAssetIds(before, after, WIKI_ASSET_PREFIX);
  if (!removed.length) return;
  const assets = await tx.select({ id: wikiAssets.id }).from(wikiAssets)
    .where(and(eq(wikiAssets.wikiId, wikiId), inArray(wikiAssets.id, removed)));
  if (assets.length) await tx.insert(wikiAssetRemovals).values(assets.map((a) => ({ pageId, assetId: a.id }))).onConflictDoNothing();
}

/** Also track uploads removed before they ever reach an autosaved page. */
export async function stageUploadedWikiAssets(tx: WikiAssetTransaction, wikiId: string, pageId: string, userId: string, uploaded: unknown) {
  const ids = [...idsIn(uploaded)];
  if (!ids.length) return;
  if (ids.length > 1000) throw domainError('E_INVALID_DOC', 'Too many uploaded files in this edit.');
  const assets = await tx.select({ id: wikiAssets.id }).from(wikiAssets).where(and(
    eq(wikiAssets.wikiId, wikiId), eq(wikiAssets.uploaderId, userId), inArray(wikiAssets.id, ids),
  ));
  if (assets.length) await tx.insert(wikiAssetRemovals).values(assets.map((a) => ({ pageId, assetId: a.id }))).onConflictDoNothing();
}

/** Explicit Done editing, after saving content in the same transaction. */
export async function finalizeRemovedWikiAssets(tx: WikiAssetTransaction, wikiId: string, pageId: string) {
  const candidates = await tx.select({ id: wikiAssetRemovals.assetId }).from(wikiAssetRemovals)
    .where(eq(wikiAssetRemovals.pageId, pageId));
  if (!candidates.length) return;
  const assets = await tx.select().from(wikiAssets)
    .where(and(eq(wikiAssets.wikiId, wikiId), inArray(wikiAssets.id, candidates.map((c) => c.id))));
  if (assets.length) {
    // Archived pages remain restorable, so they still hold their files.
    // Revision history alone does not retain a file after an explicit removal.
    const pages = await tx.select({ body: wikiPages.body }).from(wikiPages).where(eq(wikiPages.wikiId, wikiId));
    // Another page may have autosaved its removal without pressing Done yet.
    const otherDrafts = await tx.select({ id: wikiAssetRemovals.assetId }).from(wikiAssetRemovals)
      .innerJoin(wikiPages, eq(wikiPages.id, wikiAssetRemovals.pageId))
      .where(and(eq(wikiPages.wikiId, wikiId), ne(wikiAssetRemovals.pageId, pageId)));
    // Conservative retention also covers an asset id quoted in page text.
    const references = JSON.stringify([pages, otherDrafts]).toLowerCase();
    for (const asset of assets) {
      if (references.includes(asset.id.toLowerCase())) continue;
      // The deletion row's key is the asset's own id: it has no default.
      await tx.insert(wikiAssetDeletions)
        .values({ id: asset.id, wikiId, filename: asset.filename, createdAt: asset.createdAt })
        .onConflictDoNothing();
      await tx.delete(wikiAssets).where(eq(wikiAssets.id, asset.id));
    }
  }
  await tx.delete(wikiAssetRemovals).where(eq(wikiAssetRemovals.pageId, pageId));
}

/**
 * Every file of a wiki that is about to be deleted (D-82), queued in the
 * deleting transaction. The queue has no foreign key to the wiki, so it
 * outlives the cascade and `deleteQueuedWikiAssets` unlinks the files after
 * the commit.
 */
export async function queueAllWikiAssets(tx: WikiAssetTransaction, wikiId: string) {
  const assets = await tx.select().from(wikiAssets).where(eq(wikiAssets.wikiId, wikiId));
  if (!assets.length) return;
  await tx.insert(wikiAssetDeletions)
    .values(assets.map((a) => ({ id: a.id, wikiId, filename: a.filename, createdAt: a.createdAt })))
    .onConflictDoNothing();
}

/** Run only after Done commits. Failures retry on the next Done editing. */
export async function deleteQueuedWikiAssets(wikiId: string): Promise<number> {
  try { return await processQueuedWikiAssets(wikiId); }
  catch (error) {
    // A committed save must not turn into a false failure because cleanup
    // could not reach the database. Its queue entries remain retryable.
    console.error('Wiki asset cleanup will retry', wikiId, error);
    return 1;
  }
}

async function processQueuedWikiAssets(wikiId: string): Promise<number> {
  const pending = await db.select().from(wikiAssetDeletions).where(eq(wikiAssetDeletions.wikiId, wikiId));
  let remaining = 0;
  for (const asset of pending) {
    try {
      try { await unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ wikiAssetDirectory(), docAssetStorageKey(asset))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await db.delete(wikiAssetDeletions).where(eq(wikiAssetDeletions.id, asset.id));
    } catch (error) {
      remaining++;
      console.error('Wiki asset deletion remains queued', asset.id, error);
    }
  }
  return remaining;
}
