import { authorize } from '@/lib/permissions';
import { createUser } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Create a person and return a one-time setup token.
 *
 * The admin never chooses anybody's password — they pass the token on, and the
 * new user sets their own. An account with no password hash cannot sign in, so
 * an unclaimed invitation is inert rather than a weak credential.
 */
export async function POST(req: Request) {
  return handle('POST /api/users', async (userId) => {
    const body = (await req.json()) as { projectId?: string; email?: unknown; name?: unknown };
    if (!body.projectId) throw new Error('projectId is required');
    await authorize(userId, body.projectId, 'user.create');
    return createUser(body.email, body.name);
  });
}
