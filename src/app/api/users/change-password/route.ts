import { NextResponse } from 'next/server';
import { currentUserId } from '@/auth';
import { changeOwnPassword } from '@/lib/admin';
import { DomainError } from '@/lib/errors';

/**
 * Change your own password.
 *
 * Deliberately not built on `handle()`: that refuses every request from an
 * account whose password must change, and this is the one thing such an
 * account is allowed to do. The session check is therefore written out here,
 * and the current password is required on top of it — a cookie proves a
 * session, not knowledge of the credential.
 *
 * The page uses a server action rather than this route, because it must end
 * the session in the same response. Both go through `changeOwnPassword`, so
 * the rules cannot drift apart, and this route is what the e2e suite drives.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ code: 'E_FORBIDDEN', message: 'Sign in first.' }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = (await req.json()) as {
      currentPassword?: string; newPassword?: string;
    };
    await changeOwnPassword(userId, currentPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error('POST /api/users/change-password', err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'That did not save.' }, { status: 500 });
  }
}
