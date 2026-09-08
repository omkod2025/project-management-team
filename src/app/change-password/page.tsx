import { redirect } from 'next/navigation';
import { currentUserId } from '@/auth';
import { mustChangePassword } from '@/lib/admin';
import { MIN_PASSWORD_LENGTH } from '@/lib/admin-rules';
import AuthShell from '../auth-shell';
import ChangePasswordForm from './form';

/**
 * Where a password somebody else chose is replaced by one only its owner
 * knows — and where any password can be changed voluntarily.
 *
 * The forced case is the reason this page exists. `proxy.ts` sends every other
 * route here while `user_must_change_password` is up, so this page must not be
 * behind that redirect itself, and it must be reachable by an account that can
 * do nothing else.
 */
export default async function ChangePassword() {
  const userId = await currentUserId();
  if (!userId) redirect('/sign-in');

  const forced = await mustChangePassword(userId);

  return (
    <AuthShell
      title={forced ? 'Choose your own password' : 'Change your password'}
      lede={
        forced
          ? 'The password you signed in with was set by an admin, so two people know it. Replace it and the rest of Field Book opens up.'
          : 'You will be asked to sign in again afterwards — the session was made with the old password.'
      }
    >
      <ChangePasswordForm forced={forced} minLength={MIN_PASSWORD_LENGTH} />
    </AuthShell>
  );
}
