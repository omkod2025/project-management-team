import { handle } from '@/lib/api';
import { archiveDoc } from '@/lib/docs';
import { purgeDoc, restoreDoc } from '@/lib/doc-purge';
import { domainError } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

/**
 * Delete a document — archival (D-61). With `?permanent=1`, an already deleted
 * document is removed for good, pages and all. Admin only, both ways.
 */
export async function DELETE(req: Request, { params }: Context) {
  const permanent = new URL(req.url).searchParams.get('permanent') === '1';
  return handle(permanent ? 'DELETE doc permanently' : 'DELETE doc', async (userId) => {
    const { id } = await params;
    return permanent ? purgeDoc(userId, id) : archiveDoc(userId, id);
  });
}

/** `{ action: 'restore' }` brings a deleted document back. Admin only. */
export async function PATCH(req: Request, { params }: Context) {
  return handle('Restore doc', async (userId) => {
    let body: unknown;
    try { body = await req.json(); } catch { throw domainError('E_INVALID_DOC', 'Invalid document action.'); }
    if (!body || typeof body !== 'object' || (body as { action?: unknown }).action !== 'restore') {
      throw domainError('E_INVALID_DOC', 'Invalid document action.');
    }
    return restoreDoc(userId, (await params).id);
  });
}
