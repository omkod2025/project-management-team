import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { fieldDefinitions } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { updateField } from '@/lib/admin';
import { domainError } from '@/lib/errors';
import { handle } from '@/lib/api';

/**
 * Rename, reorder, archive or restore a column.
 *
 * There is no DELETE here, deliberately: a stored value has no foreign key
 * protecting it, so archiving is the only removal (D-34).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`PATCH /api/fields/${id}`, async (userId) => {
    const [field] = await db
      .select({ projectId: fieldDefinitions.projectId })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.id, id))
      .limit(1);
    if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column.');

    await authorize(userId, field.projectId, 'field.archive');
    await updateField(id, (await req.json()) as Record<string, unknown>);
    return { ok: true };
  });
}
