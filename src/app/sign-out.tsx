import { signOut } from '@/auth';

/**
 * Sign out.
 *
 * A form posting to a server action, not a client fetch. Two reasons it is
 * built this way rather than as a button with an `onClick`:
 *
 *   - it works with JavaScript disabled or still loading, which matters for
 *     the one control whose whole job is to end a session on a machine the
 *     user may be walking away from;
 *   - the session cookie is cleared server-side in the same response that
 *     redirects, so there is no window in which the page has "signed out" but
 *     the cookie is still live.
 *
 * The button is styled by its caller: this component appears on the shelf, on
 * the access board and in the List's head, and those three surfaces do not
 * share a visual language any more (the List speaks the ClickUp restyle). It
 * takes a class name and nothing else.
 */
export default function SignOut({ className = '' }: { className?: string }) {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/sign-in' });
      }}
    >
      <button type="submit" className={className}>Sign out</button>
    </form>
  );
}
