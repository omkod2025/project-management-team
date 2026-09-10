import { currentUserId } from '@/auth';
import { NotificationsProvider } from './bell';

/**
 * Everything you have to be signed in to read.
 *
 * The group exists to give one thing a home. Every page in this product draws
 * its own `<header>` — the shelf, the List, All Timeline, the access board and
 * the profile do not share a visual language any more — so the state behind a
 * control that appears on all of them could not live inside any one of them.
 * The provider holds that state: the poll, the count, the tab title and the
 * slip. The bell *itself* is placed by each page, in its own header, beside its
 * own nav.
 *
 * What the group buys beyond convenience is the negative: `/d/[token]`, the
 * published document link a stranger may open, sits outside this directory, as
 * do `/sign-in`, `/set-password` and `/change-password`. None of them can show
 * a bell, and not because anybody remembered to leave it out of a list — the
 * `Bell` component renders nothing without this provider above it.
 *
 * The group does **not** authenticate. `proxy.ts` and `authorize()` still do
 * that, and each page still resolves its own reader; this only decides whether
 * notifications are polled at all, and polls none when there is nobody to poll
 * for.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();

  if (!userId) return <>{children}</>;
  return <NotificationsProvider>{children}</NotificationsProvider>;
}
