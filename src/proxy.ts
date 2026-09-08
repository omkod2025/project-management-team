import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * One job: while an account holds a password its admin chose, every page it
 * asks for is /change-password.
 *
 * This is a redirect for the user's sake, not the enforcement. Next's own
 * guidance is that a proxy matcher is a list a new route can quietly fall off,
 * so the refusal that matters lives in `authorize()` and `handle()`, which read
 * `user_must_change_password` from the database on every call. If this file
 * were deleted the product would still be safe — it would just be baffling,
 * because a signed-in user would see pages that refused every action.
 *
 * The flag is read from the session token rather than the database: a proxy
 * runs in front of the app on every request, and a query there would be a
 * query on every asset the matcher does not exclude.
 */
export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    // Auth.js v5 names the cookie `authjs.session-token`, and `__Secure-`
    // prefixed over HTTPS. `getToken` picks the right one from this flag.
    secureCookie: process.env.NODE_ENV === 'production',
    cookieName: process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
  });

  if (token?.mustChangePassword) {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Every page except the four an unreleased account still needs:
     * /change-password is the way out, /sign-in and /set-password are how you
     * arrive, and /api/auth is what signing in and out posts to.
     *
     * `api` at large is excluded because those routes must answer 403 rather
     * than redirect — a fetch that follows a redirect to an HTML page reports
     * a parse error, which tells the caller nothing about what was wrong.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sign-in|set-password|change-password|.*\\..*).*)',
  ],
};
