import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadAccessBoard } from '@/lib/people';
import SignOut from '../sign-out';
import PeopleView from './people-view';

/**
 * `/people` — who can reach which project, and as what.
 *
 * Deliberately not a 404 for a non-admin. Everywhere else in this system a
 * refusal is a 404, because a 403 confirms a project exists (spec 05 §2) — but
 * here there is no project in the URL to confirm. `/people` exists for every
 * signed-in user; what varies is how many columns it has, and a user who
 * administers nothing gets a page that says so.
 */
export default async function People() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  return (
    <PeopleView
      board={await loadAccessBoard(userId)}
      actingUserId={userId}
      /* Rendered on the server and passed down: signing out is a server action
         and `people-view` is a client component, which cannot declare one. */
      signOut={<SignOut className="label shelf-button" />}
    />
  );
}
