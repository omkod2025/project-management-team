import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { createToken, listAllTokens, listMyTokens } from '@/lib/wiki-tokens';

/**
 * The caller's wiki access tokens (spec §6a), or every token for the install
 * admin with `?all=1` (§6c) — anyone else asking for that gets 404. Session
 * only: a token cannot list or mint tokens.
 */
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get('all') === '1';
  return handle(all ? 'GET /api/wiki-tokens?all=1' : 'GET /api/wiki-tokens',
    (userId) => (all ? listAllTokens(userId) : listMyTokens(userId)));
}

/** `{ label, wikiIds, expiresAt? }`. The response is the only place the secret ever appears. */
export async function POST(req: Request) {
  return handle('POST /api/wiki-tokens', async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send the token label and wikis as JSON.'); }
    return createToken(userId, body);
  });
}
