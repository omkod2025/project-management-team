import { MAX_UPLOAD_REQUEST_BYTES } from '@/lib/upload-limits';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { nodes, fieldDefinitions } from '@/db/schema';
import { handle } from '@/lib/api';
import { authorize } from '@/lib/permissions';
import { uploadDocAsset } from '@/lib/doc-assets';
import { domainError } from '@/lib/errors';
import { isImageFile } from '@/lib/image-files';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle('POST node image', async (userId) => {
    const { id } = await params;
    const [node] = await db.select().from(nodes).where(and(eq(nodes.id, id), isNull(nodes.archivedAt))).limit(1);
    if (!node) throw domainError('E_NOT_FOUND', 'No such task.');
    await authorize(userId, node.projectId, 'node.editValues');
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD_REQUEST_BYTES) throw domainError('E_INVALID_DOC', 'Choose an image no larger than 50 MB.');
    const form = await req.formData();
    const fieldId = form.get('fieldId');
    const [field] = typeof fieldId === 'string' ? await db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.projectId, node.projectId), isNull(fieldDefinitions.archivedAt))).limit(1) : [];
    if (field?.kind !== 'image') throw domainError('E_UNKNOWN_FIELD', 'Choose an image column.');
    const file = form.get('file');
    if (!(file instanceof File) || !isImageFile(file)) throw domainError('E_INVALID_DOC', 'Choose an image file.');
    // Existing asset service validates preview formats and preserves all other
    // originals as downloads, including camera RAW and HEIC.
    const preview = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type) || /\.svg$/i.test(file.name);
    return uploadDocAsset(userId, node.projectId, file, !preview);
  });
}
