import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { fieldDefinitions } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { deleteField, updateField } from '@/lib/admin';
import { domainError } from '@/lib/errors';
import { handle } from '@/lib/api';

/**
 * Rename, reorder, archive or restore a column — or delete it (D-34c).
 *
 * DELETE removes the definition and its options. Values already stored on
 * tasks stay where they are, unread: see `deleteField`.
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`DELETE /api/fields/${id}`, async (userId) => {
    const [field] = await db
      .select({ projectId: fieldDefinitions.projectId })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.id, id))
      .limit(1);
    if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column.');

    await authorize(userId, field.projectId, 'field.archive');
    await deleteField(id);
    return { ok: true };
  });
}
