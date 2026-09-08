import { updateOwnName } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Your own account.
 *
 * No `authorize(...)` and no id in the path: capabilities are scoped to a
 * project (spec 05 §4) and this is not about one. `handle()` resolves the
 * caller from the session and that *is* the standing — the only account this
 * route can reach is the one asking, so there is nothing to check beyond being
 * signed in.
 *
 * `handle()` also turns away an account still holding a password its admin
 * chose, which is right: renaming yourself is not the one thing such an account
 * is allowed to do.
 */
export async function PATCH(req: Request) {
  return handle('PATCH /api/users/me', async (userId) => {
    const body = (await req.json()) as { name?: unknown };
    return updateOwnName(userId, body.name);
  });
}
