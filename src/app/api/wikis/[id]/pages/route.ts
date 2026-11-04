import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { createWikiPage, loadWiki, restoreWikiPage } from '@/lib/wiki';

type Context = { params: Promise<{ id: string }> };

async function jsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); }
  catch { throw domainError('E_INVALID_DOC', 'Send the page as JSON.'); }
}

/** The wiki, its page tree, and (for writers) its archived pages. */
export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`GET /api/wikis/${id}/pages`, (userId) => loadWiki(userId, id));
}

/** `{ title, slug?, parentId?, body? }` — write members, owner, install admin. */
export async function POST(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`POST /api/wikis/${id}/pages`, async (userId) => createWikiPage(userId, id, await jsonBody(req)));
}

/** Restore an archived page: `{ pageId }`. */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PATCH /api/wikis/${id}/pages`, async (userId) => restoreWikiPage(userId, id, await jsonBody(req)));
}
