import 'server-only';
import { NextResponse } from 'next/server';
import { currentUserId } from '@/auth';
import { DomainError } from '@/lib/errors';
import { mustChangePassword } from '@/lib/admin';

/**
 * The shape every admin route shares: resolve the caller, run the work, and
 * turn a DomainError into the status its code already implies.
 *
 * Written once so a new route cannot forget the 401, and so an unexpected
 * exception can never leak a database message to the client.
 */
export async function handle<T>(
  label: string,
  work: (userId: string) => Promise<T>,
): Promise<NextResponse> {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ code: 'E_FORBIDDEN', message: 'Sign in first.' }, { status: 401 });
  }
  // An account still holding a password its admin chose can do exactly one
  // thing, and this is not it. `proxy.ts` turns the pages away for the sake of
  // the user; this turns the API away for the sake of the account, because a
  // proxy matcher is a list that a new route can fall off.
  if (await mustChangePassword(userId)) {
    return NextResponse.json(
      { code: 'E_FORBIDDEN', message: 'Change your password before you do anything else.' },
      { status: 403 },
    );
  }
  try {
    return NextResponse.json((await work(userId)) ?? { ok: true });
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error(label, err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'That did not save.' }, { status: 500 });
  }
}
