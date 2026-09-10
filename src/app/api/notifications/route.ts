import { handle } from '@/lib/api';
import { countUnread, loadNotifications, markAllRead } from '@/lib/notifications';
import type { NotificationRow } from '@/lib/notifications';

/**
 * The bell (spec 11 §5).
 *
 * There is no project id in any of these routes and no `authorize()` call,
 * which looks like an omission and is not: a notification belongs to a person,
 * not to a project, and every read is already scoped to the caller by
 * `loadNotifications` joining their membership. The capability table has no
 * row for it because there is no role that can read somebody else's bell —
 * not even an admin, who would have to become a different person to have one.
 */

/**
 * `?count=1` is the polled form: the whole page fetches this every 60 seconds
 * (spec 11 §4), so it returns one integer rather than fifty rows. The list
 * itself is fetched once, when the leaf is opened.
 */
export async function GET(req: Request) {
  const wantsCount = new URL(req.url).searchParams.get('count') !== null;

  return handle('GET /api/notifications', async (userId): Promise<
    { unread: number } | { unread: number; items: NotificationRow[] }
  > => {
    const unread = await countUnread(userId);
    if (wantsCount) return { unread };
    return { unread, items: await loadNotifications(userId) };
  });
}

/** Clear the badge without following anything through. */
export async function POST() {
  return handle('POST /api/notifications', async (userId) => {
    await markAllRead(userId);
    return { unread: 0 };
  });
}
