import { handle } from '@/lib/api';
import { domainError } from '@/lib/errors';
import { listMembers, removeMember, setMember } from '@/lib/wiki';

type Context = { params: Promise<{ id: string }> };

async function jsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); }
  catch { throw domainError('E_INVALID_DOC', 'Send the members as JSON.'); }
}

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`GET /api/wikis/${id}/members`, (userId) => listMembers(userId, id));
}

/** Grant or change access: `{ userIds: [...], access: 'read' | 'write' }`, or one `{ userId, access }`. */
export async function PUT(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`PUT /api/wikis/${id}/members`, async (userId) => {
    await setMember(userId, id, await jsonBody(req));
    return { ok: true };
  });
}

/** Remove members: `{ userIds: [...] }`, or one `{ userId }`. */
export async function DELETE(req: Request, { params }: Context) {
  const { id } = await params;
  return handle(`DELETE /api/wikis/${id}/members`, async (userId) => {
    await removeMember(userId, id, await jsonBody(req));
    return { ok: true };
  });
}
