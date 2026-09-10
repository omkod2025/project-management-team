import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadProfile } from '@/lib/admin';
import SignOut from '../sign-out';
import ProfileView from './profile-view';

/**
 * `/profile` — the one page about you rather than about the work.
 *
 * There is no id in the URL and no way to put one there. Every other page in
 * this product has to decide who may open it; this one is defined as the
 * account asking, so the question never arises and cannot be got wrong.
 *
 * It holds the two things a person owns about their own account — the name
 * everybody else reads them by, and the password — and states the third, their
 * access, without offering to change it. Access is granted per project by an
 * admin of that project (spec 05 §2); a control here would be the account-wide
 * setting the permissions model refuses to have.
 */
export default async function ProfilePage() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  return (
    <ProfileView
      profile={await loadProfile(userId)}
      /* Rendered on the server and passed down: signing out is a server action
         and `profile-view` is a client component, which cannot declare one. */
      signOut={<SignOut className="label shelf-button" />}
    />
  );
}
