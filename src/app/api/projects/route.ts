import { createProject } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Start a new project.
 *
 * No `authorize` call, and that is the point: permissions are scoped to a
 * project (spec 05 §4), and there is no project yet to be scoped against. Any
 * signed-in person may begin one, and becomes its admin by doing so.
 */
export async function POST(req: Request) {
  return handle('POST /api/projects', async (userId) => {
    const body = (await req.json()) as { name?: unknown };
    return createProject(userId, body);
  });
}
