import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { createToken, listAllTokens, listMyTokens } from '@/lib/access-tokens';

/**
 * The caller's access tokens (central MCP tokens design; wiki spec §6a), or
 * every token for the install admin with `?all=1` (§6c) — anyone else asking
 * for that gets 404. Session only: a token cannot list or mint tokens.
 */
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get('all') === '1';
  return handle(all ? 'GET /api/tokens?all=1' : 'GET /api/tokens',
    (userId) => (all ? listAllTokens(userId) : listMyTokens(userId)));
}

/**
 * `{ label, expiresAt?, grants, scope: { projectIds?, wikiIds? } }`. The
 * response is the only place the secret ever appears.
 */
export async function POST(req: Request) {
  return handle('POST /api/tokens', async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send the token label, grants and scope as JSON.'); }
    return createToken(userId, body);
  });
}
