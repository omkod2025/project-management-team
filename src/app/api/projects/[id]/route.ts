import { authorize } from '@/lib/permissions';
import { setStatusField } from '@/lib/admin';
import { handle } from '@/lib/api';

/** Designate (or clear) the project's status column — D-35. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`PATCH /api/projects/${id}`, async (userId) => {
    const body = (await req.json()) as { statusFieldId?: string | null };
    await authorize(userId, id, 'field.setStatusField');
    await setStatusField(id, body.statusFieldId ?? null);
    return { ok: true };
  });
}
