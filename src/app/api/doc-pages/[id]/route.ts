import { handle } from '@/lib/api';
import { saveDocPage } from '@/lib/docs';
import { domainError } from '@/lib/errors';
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle('PATCH doc page', async (userId) => {
    let body: unknown;
    try { body = await req.json(); } catch { throw domainError('E_INVALID_DOC', 'Invalid page content.'); }
    return saveDocPage(userId, (await params).id, body);
  });
}
