import { authorize } from '@/lib/permissions';
import { renameProject, setStatusField } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Two changes to the project itself, each behind its own capability.
 *
 * They are separate keys rather than one "edit project" because they are
 * different acts: renaming changes a label, designating the status column
 * changes what the product records without being asked (D-35).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`PATCH /api/projects/${id}`, async (userId) => {
    const body = (await req.json()) as { name?: unknown; statusFieldId?: string | null };

    if (body.name !== undefined) {
      await authorize(userId, id, 'project.rename');
      return renameProject(id, body.name);
    }

    await authorize(userId, id, 'field.setStatusField');
    await setStatusField(id, body.statusFieldId ?? null);
    return { ok: true };
  });
}
