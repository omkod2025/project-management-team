import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { fieldDefinitions } from '@/db/schema';
import { authorize } from '@/lib/permissions';
import { createOption } from '@/lib/admin';
import { domainError } from '@/lib/errors';
import { handle } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`POST /api/fields/${id}/options`, async (userId) => {
    const [field] = await db
      .select({ projectId: fieldDefinitions.projectId })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.id, id))
      .limit(1);
    if (!field) throw domainError('E_UNKNOWN_FIELD', 'No such column.');

    await authorize(userId, field.projectId, 'option.define');
    return { id: await createOption(id, (await req.json()) as Record<string, unknown>) };
  });
}
