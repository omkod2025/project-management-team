import { MAX_UPLOAD_BYTES } from '@/lib/upload-limits';
import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { docAssets, projects } from '@/db/schema';
import { authorize, requireProjectRole } from '@/lib/permissions';
import { domainError } from '@/lib/errors';
import { validateDocSvg } from '@/lib/doc-svg';
import { docAssetStorageKey } from '@/lib/doc-asset-path';

// Runtime-mounted mutable assets must not be bundled into the server output.
const directory = () => path.resolve(/* turbopackIgnore: true */ process.env.DOC_ASSET_DIR || 'data/doc-assets');
const validId = (id: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);

async function projectAccess(userId: string, id: string) {
  if (!validId(id)) throw domainError('E_NOT_FOUND', 'No such project.');
  await requireProjectRole(userId, id, 'read');
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.archivedAt)));
  if (!project) throw domainError('E_NOT_FOUND', 'No such project.');
}

export async function uploadDocAsset(userId: string, projectId: string, file: File, attachment = false) {
  await projectAccess(userId, projectId);
  await authorize(userId, projectId, 'doc.edit');
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw domainError('E_INVALID_DOC', 'Choose a non-empty file no larger than 50 MB.');
  let data = Buffer.from(await file.arrayBuffer());
  const mime = attachment ? 'application/octet-stream' : data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'image/jpeg'
    : ['GIF87a','GIF89a'].includes(data.subarray(0,6).toString()) ? 'image/gif'
    : data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP' ? 'image/webp'
    : file.type === 'image/svg+xml' || /\.svg$/i.test(file.name) ? 'image/svg+xml' : null;
  if (!mime || (!attachment && mime !== file.type && mime !== 'image/svg+xml')) throw domainError('E_INVALID_DOC', 'Use a PNG, JPEG, WebP, GIF or SVG image.');
  if (mime === 'image/svg+xml') {
    try { data = Buffer.from(validateDocSvg(data)); }
    catch { throw domainError('E_INVALID_DOC', 'This file could not be read as SVG. Export it again as a valid SVG without custom XML entities (maximum 20,000 nodes and 64 nested levels).'); }
  }
  const filename = Array.from(file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_')).slice(0, 200).join('') || 'attachment';
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const storageKey = docAssetStorageKey({ id, filename, createdAt });
  const destination = path.join(/* turbopackIgnore: true */ directory(), storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(destination), { recursive: true });
  // Files are immutable. A failed registry insert leaves an orphan for a later
  // sweep; it never exposes an unregistered URL or deletes another reference.
  await writeFile(/* turbopackIgnore: true */ destination, data, { flag: 'wx' });
  await db.insert(docAssets).values({ id, projectId, uploaderId: userId, filename, mime, bytes: data.length, createdAt });
  return { url: `/api/doc-assets/${id}`, filename, bytes: data.length };
}

export async function readDocAsset(userId: string, id: string) {
  if (!validId(id)) throw domainError('E_NOT_FOUND', 'No such file.');
  const [asset] = await db.select().from(docAssets).where(eq(docAssets.id, id));
  if (!asset) throw domainError('E_NOT_FOUND', 'No such file.');
  await projectAccess(userId, asset.projectId);
  try {
    let data: Buffer;
    try {
      data = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory(), docAssetStorageKey(asset)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Existing assets predate year/month storage and keep their original URLs.
      data = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory(), id));
    }
    return { data, mime: asset.mime, filename: asset.filename };
  }
  catch { throw domainError('E_NOT_FOUND', 'File is unavailable.'); }
}
