import { NextResponse } from 'next/server';
import { claimSetupToken } from '@/lib/admin';
import { DomainError } from '@/lib/errors';

/**
 * Claim a setup token. Deliberately the one route with no session check:
 * the caller has no account yet, and the token is the credential.
 */
export async function POST(req: Request) {
  try {
    const { token, password } = (await req.json()) as { token?: string; password?: string };
    await claimSetupToken(token, password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json(err.toJSON(), { status: err.status });
    console.error('POST /api/users/set-password', err);
    return NextResponse.json({ code: 'E_UNKNOWN', message: 'That did not save.' }, { status: 500 });
  }
}
