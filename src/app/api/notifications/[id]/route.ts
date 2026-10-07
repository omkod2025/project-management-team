import { handle } from '@/lib/api';
import { notificationKind } from '@/lib/work-kind';
import { countUnread, markRead } from '@/lib/notifications';

/**
 * Mark one notification read — sent when the reader follows it to the task.
 *
 * No 404 for an id that is not theirs, and none for an id that does not exist:
 * `markRead` scopes the UPDATE by user, both cases change nothing, and both
 * answer the same. An endpoint that distinguished them would be a way to ask
 * whether a given id is real.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const kind = notificationKind(new URL(req.url).searchParams.get('kind'));
  const { id } = await ctx.params;
  return handle(`POST /api/notifications/${id}`, async (userId) => {
    await markRead(userId, id, kind);
    return { unread: await countUnread(userId, kind) };
  });
}
