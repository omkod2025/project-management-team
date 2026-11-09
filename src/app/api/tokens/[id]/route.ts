import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { revokeToken, updateToken } from '@/lib/access-tokens';

type Context = { params: Promise<{ id: string }> };

/**
 * Rename, regrant and rescope one of your own tokens: `{ label, grants?, scope? }`.
 * An omitted `grants` or `scope` keeps what the token has; `expiresAt` is ignored.
 */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PATCH /api/tokens/${id}`, async (userId) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { throw domainError('E_INVALID_DOC', 'Send the token label, grants and scope as JSON.'); }
    return updateToken(userId, id, body);
  });
}

/** Revoke — yours, or any token for the install admin. Cannot be undone. */
export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`DELETE /api/tokens/${id}`, async (userId) => {
    await revokeToken(userId, id);
    return { ok: true };
  });
}
