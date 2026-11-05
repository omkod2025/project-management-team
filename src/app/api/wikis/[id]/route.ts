import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { deleteWiki, getWiki, updateWiki } from '@/lib/wiki';

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`GET /api/wikis/${id}`, (userId) => getWiki(userId, id));
}

/** `{ action: 'rename' | 'describe' | 'archive' | 'restore' | 'transfer' | 'publish' | 'unpublish', … }` — owner or install admin. */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PATCH /api/wikis/${id}`, async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send the change as JSON.'); }
    return updateWiki(userId, id, body);
  });
}

/** Deletes the wiki and everything in it, for good (D-82) — install admin only. */
export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`DELETE /api/wikis/${id}`, (userId) => deleteWiki(userId, id));
}
