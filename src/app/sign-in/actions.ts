'use server';

import { signIn } from '@/auth';

/**
 * Sign in, or say why not.
 *
 * Returns the refusal instead of redirecting to `?error=1`, for two reasons:
 * the typed address survives the round trip, so a mistyped password does not
 * cost it; and nothing about the attempt is written into the URL, where an
 * email address would sit in history and in any log that records the line.
 *
 * One message for a wrong address and a wrong password alike. Naming which
 * half was wrong tells anybody who asks which addresses have accounts here.
 */
export async function attemptSignIn(
  _state: { error: string } | null,
  form: FormData,
): Promise<{ error: string } | null> {
  try {
    await signIn('credentials', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      redirectTo: '/',
    });
  } catch (err) {
    // next-auth signals a successful sign-in by throwing the redirect.
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
    return { error: 'That email and password do not match an active account.' };
  }
  return null;
}
