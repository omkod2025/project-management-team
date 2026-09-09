import { MAX_UPLOAD_REQUEST_BYTES } from '@/lib/upload-limits';
import { handle } from '@/lib/api';
import { uploadDocAsset } from '@/lib/doc-assets';
import { domainError } from '@/lib/errors';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle('POST doc asset', async (userId) => {
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD_REQUEST_BYTES) throw domainError('E_INVALID_DOC', 'Choose a file no larger than 50 MB.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw domainError('E_INVALID_DOC', 'Choose a file to upload.');
    const kind = form.get('kind');
    if (kind !== null && kind !== 'image' && kind !== 'attachment') throw domainError('E_INVALID_DOC', 'Choose image or attachment.');
    return uploadDocAsset(userId, (await params).id, file, kind === 'attachment');
  });
}
