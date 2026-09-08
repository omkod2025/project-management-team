import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { loadRoster } from '@/lib/roster';
import RosterView from './roster-view';

/**
 * The roster: one lane per person, every project they are in, on one scale.
 *
 * Filed at the shelf rather than under a project because the question is
 * cross-project by construction — a person's schedule collides mostly with
 * their own work elsewhere, which is precisely what /p/<slug>/timeline cannot
 * show.
 */

export default async function RosterPage() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const roster = await loadRoster(userId);
  return <RosterView roster={roster} />;
}
