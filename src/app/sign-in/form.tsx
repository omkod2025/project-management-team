'use client';

import { useActionState, useId } from 'react';
import { attemptSignIn } from './actions';
import { EmailField, PasswordField, Errata } from '../auth-fields';

export default function SignInForm() {
  const [state, action, pending] = useActionState(attemptSignIn, null);
  const errorId = useId();

  return (
    <form action={action}>
      <div className="auth-fields">
        <EmailField
          label="Email" required autoFocus autoComplete="username"
          invalid={!!state?.error} describedBy={state?.error ? errorId : undefined}
        />
        <PasswordField
          name="password" label="Password" required autoComplete="current-password"
          invalid={!!state?.error} describedBy={state?.error ? errorId : undefined}
        />
      </div>

      {state?.error && <Errata id={errorId}>{state.error}</Errata>}

      <button type="submit" className="auth-submit" disabled={pending} aria-busy={pending}>
        {pending ? 'Signing in' : 'Sign in'}
      </button>

      {/* Where the reference put Google, GitLab and Registration. None of them
          exist here, and the true reason is more use than a button that would
          have to refuse. */}
      <p className="auth-note">
        T-Timeline has no sign-up. An <strong>admin</strong> creates your
        account and sends you a one-time link to set your own password.
      </p>
    </form>
  );
}
