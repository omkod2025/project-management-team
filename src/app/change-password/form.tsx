'use client';

import { useActionState, useId } from 'react';
import { changePassword } from './actions';
import { PasswordField, Errata } from '../auth-fields';

/**
 * The forced case and the voluntary case are the same form. Only the framing
 * differs, and when forced there is no way out of the page, so it does not
 * offer a cancel that would not work.
 */
export default function ChangePasswordForm(
  { forced, minLength }: { forced: boolean; minLength: number },
) {
  const [state, action, pending] = useActionState(changePassword, null);
  const errorId = useId();

  return (
    <form action={action}>
      <div className="auth-fields">
        <PasswordField
          name="current"
          label={forced ? 'The password you were given' : 'Current password'}
          required autoFocus autoComplete="current-password"
          invalid={!!state?.error}
          describedBy={state?.error ? errorId : undefined}
        />
        <PasswordField
          name="next" label="New password" required
          minLength={minLength} autoComplete="new-password"
        />
        <PasswordField
          name="again" label="Again" required
          minLength={minLength} autoComplete="new-password"
        />
      </div>

      <p className="auth-hint">
        At least {minLength} characters, and not the one you are replacing.
      </p>

      {state?.error && <Errata id={errorId}>{state.error}</Errata>}

      <button type="submit" className="auth-submit" disabled={pending} aria-busy={pending}>
        {pending ? 'Saving' : 'Change password'}
      </button>

      {!forced && (
        <p className="auth-note">
          <a href="/">‹ Back to Home</a>
        </p>
      )}
    </form>
  );
}
