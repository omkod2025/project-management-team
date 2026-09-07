import { redirect } from 'next/navigation';
import { setupTokenIsLive } from '@/lib/admin';
import { MIN_PASSWORD_LENGTH } from '@/lib/admin-rules';
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

  return (
    <main className="page" style={{ padding: '32px 20px', maxWidth: 460 }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-struct)', fontSize: 'var(--type-headline-size)' }}>
        Field Book
      </h1>

      {live ? (
        <SetPasswordForm token={token} minLength={MIN_PASSWORD_LENGTH} />
      ) : (
        // An expired, wrong, or already-claimed token all say the same thing:
        // a more specific message would confirm that a token once existed.
        <p style={{ marginTop: 24, color: 'var(--color-vermilion)' }}>
          That link is not valid any more. Ask an admin for a new one.
        </p>
      )}
    </main>
  );
}
