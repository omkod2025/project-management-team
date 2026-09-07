import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { fieldDefinitions, fieldOptions } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { updateOption } from '@/lib/admin';
import { domainError } from '@/lib/errors';
import { handle } from '@/lib/api';

/** Relabel, recolour, re-stage, archive or restore an option (D-33). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`PATCH /api/options/${id}`, async (userId) => {
    const [row] = await db
      .select({ projectId: fieldDefinitions.projectId })
      .from(fieldOptions)
      .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, fieldOptions.fieldId))
      .where(eq(fieldOptions.id, id))
      .limit(1);
    if (!row) throw domainError('E_UNKNOWN_FIELD', 'No such option.');

    await authorize(userId, row.projectId, 'option.define');
    await updateOption(id, (await req.json()) as Record<string, unknown>);
    return { ok: true };
  });
}
