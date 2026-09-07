import { authorize } from '@/lib/permissions';
import { addHoliday, removeHoliday } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * The working-day calendar (D-41).
 *
 * Global to the installation but gated on being an admin of *some* project,
 * which is the one place a per-project role governs shared data. It is called
 * out here and in spec 05 §2 so it is not discovered as a surprise.
 */
export async function POST(req: Request) {
  return handle('POST /api/holidays', async (userId) => {
    const body = (await req.json()) as { projectId?: string; date?: unknown; name?: unknown };
    if (!body.projectId) throw new Error('projectId is required');
    await authorize(userId, body.projectId, 'holiday.manage');
    await addHoliday(body.date, body.name);
    return { ok: true };
  });
}

export async function DELETE(req: Request) {
  return handle('DELETE /api/holidays', async (userId) => {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) throw new Error('projectId is required');
    await authorize(userId, projectId, 'holiday.manage');
    await removeHoliday(url.searchParams.get('date'));
    return { ok: true };
  });
}
