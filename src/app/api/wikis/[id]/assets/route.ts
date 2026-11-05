import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { MAX_UPLOAD_REQUEST_BYTES } from '@/lib/upload-limits';
import { uploadWikiAsset } from '@/lib/wiki-assets';

/** Multipart `file`, with `kind` = `image` (default) or `attachment`, as for Docs. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(`POST /api/wikis/${id}/assets`, async (userId) => {
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD_REQUEST_BYTES) {
      throw domainError('E_INVALID_DOC', 'Choose a file no larger than 50 MB.');
    }
    let form: FormData;
    try { form = await req.formData(); }
    catch { throw domainError('E_INVALID_DOC', 'Choose a file to upload.'); }
    const file = form.get('file');
    if (!(file instanceof File)) throw domainError('E_INVALID_DOC', 'Choose a file to upload.');
    const kind = form.get('kind');
    if (kind !== null && kind !== 'image' && kind !== 'attachment') throw domainError('E_INVALID_DOC', 'Choose image or attachment.');
    return uploadWikiAsset(userId, id, file, kind === 'attachment');
  });
}
