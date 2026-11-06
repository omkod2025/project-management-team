'use server';

import { signOut } from '@/auth';

/**
 * The sign-out action, in a module of its own so that the shared header —
 * which client pages render too — can reach it. An inline `'use server'`
 * closure only works inside a server component; a module-level one works
 * from either side of the boundary.
 */
export async function signOutAction() {
  await signOut({ redirectTo: '/sign-in' });
}
