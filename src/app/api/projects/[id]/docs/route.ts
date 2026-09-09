import { handle } from '@/lib/api';
import { createDoc, listDocs } from '@/lib/docs';
import { domainError } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Context) {
  return handle('GET project docs', async (userId) => listDocs(userId, (await params).id));
}

export async function POST(req: Request, { params }: Context) {
  return handle('POST project docs', async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send a document title and optional version as JSON.'); }
    return createDoc(userId, (await params).id, body);
  });
}
