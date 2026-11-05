import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { archiveWikiPage, moveWikiPage, saveWikiPage } from '@/lib/wiki';

type Context = { params: Promise<{ id: string }> };

async function jsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); }
  catch { throw domainError('E_INVALID_DOC', 'Send the page as JSON.'); }
}

/** The PageEditor save: `{ content: { body }, title?, updatedAt, forceRevision?, finalizeAssets?, uploadedAssets? }`. */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PATCH /api/wiki-pages/${id}`, async (userId) => saveWikiPage(userId, id, await jsonBody(req)));
}

/** Structural actions: `{ action: 'move', parentId, beforeId? }` or `{ action: 'archive' }`. */
export async function POST(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`POST /api/wiki-pages/${id}`, async (userId) => {
    const body = await jsonBody(req);
    const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
    if (action === 'move') return moveWikiPage(userId, id, body);
    if (action === 'archive') {
      await archiveWikiPage(userId, id);
      return { archived: true };
    }
    throw domainError('E_INVALID_DOC', 'Choose move or archive.');
  });
}
