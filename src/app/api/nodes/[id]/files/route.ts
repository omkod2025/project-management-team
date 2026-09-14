import { MAX_FILE_FIELD_BYTES, MAX_FILE_FIELD_REQUEST_BYTES } from '@/lib/upload-limits';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { nodes, fieldDefinitions } from '@/db/schema';
import { handle } from '@/lib/api';
import { authorize } from '@/lib/permissions';
import { uploadDocAsset } from '@/lib/doc-assets';
import { domainError } from '@/lib/errors';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle('POST node file', async (userId) => {
    const { id } = await params;
    const [node] = await db.select().from(nodes).where(and(eq(nodes.id, id), isNull(nodes.archivedAt))).limit(1);
    if (!node) throw domainError('E_NOT_FOUND', 'No such task.');
    await authorize(userId, node.projectId, 'node.editValues');
    if (Number(req.headers.get('content-length')) > MAX_FILE_FIELD_REQUEST_BYTES) throw domainError('E_INVALID_DOC', 'Choose a file no larger than 20 MB.');
    const form = await req.formData();
    const fieldId = form.get('fieldId');
    const [field] = typeof fieldId === 'string' ? await db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.id, fieldId), eq(fieldDefinitions.projectId, node.projectId), isNull(fieldDefinitions.archivedAt))).limit(1) : [];
    if (field?.kind !== 'file') throw domainError('E_UNKNOWN_FIELD', 'Choose a file column.');
    const file = form.get('file');
    if (!(file instanceof File)) throw domainError('E_INVALID_DOC', 'Choose a file.');
    // Any format is allowed here, so every upload is stored and served as an
    // opaque attachment — never as something a browser will render in place.
    return uploadDocAsset(userId, node.projectId, file, true, MAX_FILE_FIELD_BYTES);
  });
}
