import { issuePasswordReset } from '@/lib/admin';
import { handle } from '@/lib/api';

/**
 * Reset somebody's password: revoke the one they hold and issue a one-time
 * setup link they can use to choose a new one.
 *
 * No password crosses this boundary in either direction, which is the whole
 * design. The response carries the token, and it is the only time it is
 * readable — it is not stored anywhere the board can read it back, so an admin
 * who loses the link issues another reset rather than looking it up.
 *
 * No `authorize(...)`, for the reason `DELETE /api/users/:id` gives: a user is
 * not inside a project, so there is no project id to check a capability
 * against. Standing is established in `issuePasswordReset`, which refuses
 * unless the caller administers at least one project the target is also on.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(`POST /api/users/${id}/password`, async (userId) => {
    const { token, expiresAt } = await issuePasswordReset(userId, id);
    return { token, expiresAt };
  });
}
