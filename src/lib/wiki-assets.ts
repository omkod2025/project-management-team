import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { wikiAssets } from '@/db/schema';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import { domainError } from '@/lib/errors';
import { validateDocSvg } from '@/lib/doc-svg';
import { docAssetStorageKey } from '@/lib/doc-asset-path';
import { requireWiki, requireWikiOr } from '@/lib/wiki';
import { WIKI_ASSET_PREFIX, wikiAssetDirectory } from '@/lib/wiki-asset-cleanup';
import { isUuid } from '@/lib/wiki-rules';

/**
 * Wiki images and attachments (wiki spec §4, §8): the Docs asset registry
 * keyed by wiki instead of project. Same sniffing, same SVG validation, same
 * 50 MB ceiling and the same year/month storage naming — only the access
 * question differs: who can see, or write, the asset's wiki.
 */


function sniffMime(data: Buffer, file: File, attachment: boolean): string | null {
  if (attachment) return 'application/octet-stream';
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString())) return 'image/gif';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return 'image/svg+xml';
  return null;
}

export async function uploadWikiAsset(userId: string, wikiId: string, file: File, attachment = false) {
  const { wiki } = await requireWiki(userId, wikiId, 'write');
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    throw domainError('E_INVALID_DOC', `Choose a non-empty file no larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }
  let data = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(data, file, attachment);
  if (!mime || (!attachment && mime !== file.type && mime !== 'image/svg+xml')) {
    throw domainError('E_INVALID_DOC', 'Use a PNG, JPEG, WebP, GIF or SVG image.');
  }
  if (mime === 'image/svg+xml') {
    try { data = Buffer.from(validateDocSvg(data)); }
    catch { throw domainError('E_INVALID_DOC', 'This file could not be read as SVG. Export it again as a valid SVG without custom XML entities (maximum 20,000 nodes and 64 nested levels).'); }
  }
  const filename = Array.from(file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_')).slice(0, 200).join('') || 'attachment';
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const destination = path.join(/* turbopackIgnore: true */ wikiAssetDirectory(), docAssetStorageKey({ id, filename, createdAt }));
  await mkdir(/* turbopackIgnore: true */ path.dirname(destination), { recursive: true });
  // Files are immutable. A failed registry insert leaves an orphan for a later
  // sweep; it never exposes an unregistered URL.
  await writeFile(/* turbopackIgnore: true */ destination, data, { flag: 'wx' });
  await db.insert(wikiAssets).values({ id, wikiId: wiki.id, uploaderId: userId, filename, mime, bytes: data.length, createdAt });
  return { url: `${WIKI_ASSET_PREFIX}${id}`, filename, bytes: data.length };
}

const fileNotFound = () => domainError('E_NOT_FOUND', 'No such file.');

/** The registry row, with no access check — callers prove their right to it. */
export async function findWikiAsset(id: string) {
  if (!isUuid(id)) throw fileNotFound();
  const [asset] = await db.select().from(wikiAssets).where(eq(wikiAssets.id, id));
  if (!asset) throw fileNotFound();
  return asset;
}

/** The file, for someone who can see its wiki. Anyone else gets the same 404 as a missing file. */
export async function readWikiAsset(userId: string, id: string) {
  const asset = await findWikiAsset(id);
  await requireWikiOr(userId, asset.wikiId, 'read', fileNotFound);
  return readWikiAssetBytes(asset);
}

export async function readWikiAssetBytes(asset: { id: string; mime: string; filename: string; createdAt: Date }) {
  try {
    const data = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ wikiAssetDirectory(), docAssetStorageKey(asset)));
    return { data, mime: asset.mime, filename: asset.filename };
  } catch {
    throw domainError('E_NOT_FOUND', 'File is unavailable.');
  }
}
