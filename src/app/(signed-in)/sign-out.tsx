'use client';

import { useFormStatus } from 'react-dom';
import { signOutAction } from './sign-out-action';

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
 * The button is styled by its caller — the shelf and the shared page header
 * each draw it their own way. It takes a class name and nothing else.
 *
 * A client component only so the button can say it is in flight; the form
 * still posts without JavaScript.
 */
export default function SignOut({ className = '' }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <SignOutButton className={className} />
    </form>
  );
}

/** Its own component because the form's pending state is only readable inside it. */
function SignOutButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending}>Sign out</button>;
}
