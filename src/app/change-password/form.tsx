'use client';

import { useActionState } from 'react';
import { changePassword } from './actions';

/**
 * The forced case and the voluntary case are the same form. Only the framing
 * differs: when forced there is no way out of the page, so it does not offer
 * a cancel that would not work.
 */
export default function ChangePasswordForm(
  { forced, minLength }: { forced: boolean; minLength: number },
) {
  const [state, action, pending] = useActionState(changePassword, null);

  return (
    <form action={action} style={{ marginTop: 26 }}>
      <h2 style={{ fontFamily: 'var(--font-struct)', fontSize: 16, margin: '0 0 10px' }}>
        {forced ? 'Choose your own password' : 'Change your password'}
      </h2>

      <p style={{ color: 'var(--color-ink-graphite-soft)', fontSize: 12.5, marginTop: 0 }}>
        {forced
          ? `The password you signed in with was set by an admin, so two people
             know it. Replace it with one nobody else has seen — at least
             ${minLength} characters — and the rest of Field Book opens up.`
          : `At least ${minLength} characters. Length is the only rule — it is
             the property that actually resists guessing.`}
      </p>

      <label className="label" htmlFor="current" style={label}>
        {forced ? 'The password you were given' : 'Current password'}
      </label>
      <input id="current" name="current" type="password" required autoFocus style={input} />

      <label className="label" htmlFor="next" style={{ ...label, marginTop: 16 }}>New password</label>
      <input id="next" name="next" type="password" required minLength={minLength} style={input} />

      <label className="label" htmlFor="again" style={{ ...label, marginTop: 16 }}>Again</label>
      <input id="again" name="again" type="password" required minLength={minLength} style={input} />

      {state?.error && (
        <p className="figure" style={{ marginTop: 14, color: 'var(--color-vermilion)' }}>
          {state.error}
        </p>
      )}

      <button type="submit" className="label" disabled={pending} style={button}>
        {pending ? 'Saving' : 'Change password'}
      </button>

      <p style={{ color: 'var(--color-ink-graphite-soft)', fontSize: 12, marginTop: 14 }}>
        You will be asked to sign in again afterwards: the session was made with
        the old password.
      </p>
    </form>
  );
}

const label: React.CSSProperties = {
  display: 'block',
  color: 'var(--color-ink-graphite-soft)',
  marginBottom: 6,
};

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 34,
  padding: '0 10px',
  background: 'var(--color-page)',
  border: '1px solid var(--color-ink-graphite)',
};

const button: React.CSSProperties = {
  marginTop: 24,
  height: 34,
  padding: '0 18px',
  background: 'var(--color-ink-graphite)',
  color: 'var(--color-page)',
  border: '1px solid var(--color-ink-graphite)',
  cursor: 'pointer',
};
