import 'server-only';
import { NextResponse } from 'next/server';
import { currentUserId } from '@/auth';
import { DomainError } from '@/lib/errors';

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
  try {
    return NextResponse.json((await work(userId)) ?? { ok: true });
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error(label, err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'That did not save.' }, { status: 500 });
  }
}
