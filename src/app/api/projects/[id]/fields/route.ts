import { authorize } from '@/lib/permissions';
import { createField, loadSettings } from '@/lib/admin';
import { handle } from '@/lib/api';

/** Everything the settings page needs, in one read. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`GET /api/projects/${id}/fields`, async (userId) => {
    await authorize(userId, id, 'field.define');
    return loadSettings(id);
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`POST /api/projects/${id}/fields`, async (userId) => {
    const body = (await req.json()) as { name?: unknown; kind?: unknown; currency?: unknown };
    await authorize(userId, id, 'field.define');
    return { id: await createField(id, body) };
  });
}
