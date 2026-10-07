import { ensureDefects } from '@/lib/defects';
import { authorize } from '@/lib/permissions';
import { setColumnOrder, setStatusField } from '@/lib/admin';
import { handle } from '@/lib/api';

/** Defect layout and status designation, independent of the Task configuration. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`PATCH /api/defects/projects/${id}`, async (userId) => {
    const body = (await req.json()) as {
      columnOrder?: unknown; statusFieldId?: string | null;
    };


    if (body.columnOrder !== undefined) {
      await authorize(userId, id, 'project.layout');
      await ensureDefects(id);
      return setColumnOrder(id, body.columnOrder, 'defect');
    }

    await authorize(userId, id, 'field.setStatusField');
    await ensureDefects(id);
    await setStatusField(id, body.statusFieldId ?? null, 'defect');
    return { ok: true };
  });
}
