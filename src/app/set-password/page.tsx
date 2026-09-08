import { redirect } from 'next/navigation';
import { setupTokenIsLive } from '@/lib/admin';
import { MIN_PASSWORD_LENGTH } from '@/lib/admin-rules';
import AuthShell from '../auth-shell';
import SetPasswordForm from './form';

/**
 * Where an invited person chooses their own password.
 *
 * The admin who created the account never sees it — they hand over a token,
 * and until it is claimed the account has no password hash at all, so it
 * cannot be signed into (see `auth.ts`).
 */
export default async function SetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect('/sign-in');

  const live = await setupTokenIsLive(token);

  if (!live) {
    return (
      <AuthShell title="This link has expired">
        {/* An expired, a wrong and an already-claimed token all say the same
            thing: anything more specific confirms that a token once existed. */}
        <p className="auth-dead">
          Ask an admin for a new one. Invitations last seven days and can only
          be used once.
        </p>
        <p className="auth-note">
          Already set your password? <strong><a href="/sign-in">Sign in</a></strong>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set your password"
      lede="Nobody else will ever see it — not even the admin who invited you."
    >
      <SetPasswordForm token={token} minLength={MIN_PASSWORD_LENGTH} />
    </AuthShell>
  );
}
