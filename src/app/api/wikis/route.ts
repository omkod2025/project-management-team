import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { createWiki, listWikis } from '@/lib/wiki';

/**
 * Wikis the caller can see, and creating one. Any active signed-in user may
 * create a wiki and becomes its owner (wiki spec §5a). Session only: a
 * bearer token is for the MCP endpoint and gets the same 401 as no session.
 */
export async function GET() {
  return handle('GET /api/wikis', (userId) => listWikis(userId));
}

export async function POST(req: Request) {
  return handle('POST /api/wikis', async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send a wiki title and optional description as JSON.'); }
    return createWiki(userId, body);
  });
}
