import { authorize } from '@/lib/permissions';
import { createUser } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Create a person, by invitation or with a starting password.
 *
 * Sending no `password` issues a one-time setup token and the new user chooses
 * their own — an account with no password hash cannot sign in, so an unclaimed
 * invitation is inert rather than a weak credential.
 *
 * Sending one hands out a password the admin knows, which the account must
 * replace before it can do anything else. The field is the plain password and
 * is hashed on this side; a hash is not accepted here, because a hash taken at
 * the boundary is itself the credential.
 */
export async function POST(req: Request) {
  return handle('POST /api/users', async (userId) => {
    const body = (await req.json()) as {
      projectId?: string; email?: unknown; name?: unknown; password?: unknown;
    };
    if (!body.projectId) throw new Error('projectId is required');
    await authorize(userId, body.projectId, 'user.create');
    return createUser(body.email, body.name, body.password);
  });
}
