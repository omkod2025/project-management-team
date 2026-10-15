import { deleteUser } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Delete an account.
 *
 * No `authorize(...)` call, for the same reason `POST /api/projects` has none:
 * capabilities are scoped to a project (spec 05 §4) and a user is not inside
 * one. `deleteUser` re-reads the caller from the database and permits only the
 * active install administrator. Project-admin membership does not grant it.
 *
 * `admin@cit.com` is refused there too, so the rule holds for any caller by
 * any route, not only for the button that happens to hide itself.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`DELETE /api/users/${id}`, async (userId) => {
    await deleteUser(userId, id);
    return { ok: true };
  });
}
