/**
 * Auth.js v5, Credentials provider over pmt_users (spec 05 §1).
 *
 * Deviation from the original spec, recorded deliberately: the spec called for
 * database-backed sessions via the Auth.js Drizzle adapter. The adapter brings
 * its own user table, which would put identity in two places — and Auth.js
 * does not support database sessions with a Credentials provider anyway.
 *
 * So sessions are JWTs over pmt_users. The cost is that a JWT cannot be
 * revoked server-side before it expires. That is mitigated by re-reading
 * `user_is_active` on every token refresh: deactivating a user takes effect
 * within the refresh interval rather than instantly.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword } from '@/lib/password';

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: '/sign-in' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const email = typeof raw?.email === 'string' ? raw.email : '';
        const password = typeof raw?.password === 'string' ? raw.password : '';
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = lower(${email})`)
          .limit(1);

        // Verify even when the user is missing, so a wrong address and a wrong
        // password take the same time to fail.
        const ok = await verifyPassword(password, user?.passwordHash ?? null);
        if (!ok || !user || !user.isActive) return null;

        return { id: user.id, name: user.fullName, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;

      // Re-check on refresh so a deactivated account loses access without
      // waiting for the 30-day session to expire.
      if (token.uid) {
        const [row] = await db
          .select({ isActive: users.isActive, mustChange: users.mustChangePassword })
          .from(users)
          .where(eq(users.id, token.uid as string))
          .limit(1);
        if (!row?.isActive) return null;
        // Carried in the token so `proxy.ts` can turn pages away without a
        // query. It is a redirect, not the enforcement: the enforcement is in
        // `authorize` and `handle`, which read the column itself. A raised flag
        // therefore takes hold at the next refresh at the latest, and a lowered
        // one never lingers, because changing a password ends the session.
        token.mustChangePassword = row.mustChange;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

/** The acting user's id, or null. Every write path starts here. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
