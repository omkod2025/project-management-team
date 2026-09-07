import { authorize } from '@/lib/permissions';
import { removeMember, setMember } from '@/lib/admin';
import { handle } from '@/lib/api';

/** Add a member, or change one's role. Refuses to remove the last admin. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`POST /api/projects/${id}/members`, async (userId) => {
    const body = (await req.json()) as { userId?: string; role?: unknown };
    await authorize(userId, id, 'member.manage');
    if (!body.userId) throw new Error('userId is required');
    await setMember(id, body.userId, body.role);
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`DELETE /api/projects/${id}/members`, async (userId) => {
    const target = new URL(req.url).searchParams.get('userId');
    await authorize(userId, id, 'member.manage');
    if (!target) throw new Error('userId is required');
    await removeMember(id, target);
    return { ok: true };
  });
}
