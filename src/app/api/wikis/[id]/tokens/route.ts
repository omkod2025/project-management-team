import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { parseTokenIds } from '@/lib/token-rules';
import { allowWikiOnMyTokens } from '@/lib/wiki-tokens';

type Context = { params: Promise<{ id: string }> };

/**
 * "Allow my token" (spec §6a): `{ tokenIds }` is the full set of the
 * caller's live tokens that should read this wiki. Writers only.
 */
export async function PUT(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PUT /api/wikis/${id}/tokens`, async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send the tokens to allow as JSON.'); }
    await allowWikiOnMyTokens(userId, id, parseTokenIds(body));
    return { ok: true };
  });
}
