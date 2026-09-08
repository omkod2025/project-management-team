'use server';

import { currentUserId, signOut } from '@/auth';
import { changeOwnPassword } from '@/lib/admin';
import { DomainError } from '@/lib/errors';

/**
 * Change your own password, then end the session.
 *
 * A server action rather than a fetch to an API route, for one reason that is
 * not style: the forced-change flag is carried in the session token, and a
 * token already issued cannot be edited. If the session survived the change,
 * `proxy.ts` would keep reading the stale flag and keep sending the user back
 * here — a loop right after the one action that was supposed to release them.
 *
 * Signing out is also the honest thing to do. The credential the session was
 * minted from no longer exists, so neither should the session.
 */
export async function changePassword(
  _state: { error: string } | null,
  form: FormData,
): Promise<{ error: string } | null> {
  const userId = await currentUserId();
  if (!userId) return { error: 'Sign in first.' };

  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  const again = String(form.get('again') ?? '');

  if (next !== again) return { error: 'The two entries do not match.' };

  try {
    await changeOwnPassword(userId, current, next);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    console.error('changePassword', err);
    return { error: 'That did not save.' };
  }

  // Throws the redirect, so nothing after it runs.
  await signOut({ redirectTo: '/sign-in?changed=1' });
  return null;
}
