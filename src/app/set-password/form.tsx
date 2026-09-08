'use client';

import { useId, useState } from 'react';
import { PasswordField, Errata } from '../auth-fields';

export default function SetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Nothing is judged until the visitor has finished with the field. Checking
  // on every keystroke narrates "eight more characters, seven more…" to a
  // screen reader and scolds everybody else halfway through a word.
  const [touched, setTouched] = useState(false);
  const noteId = useId();

  const short = touched && password.length > 0 && password.length < minLength;
  const mismatch = touched && confirm.length > 0 && confirm !== password;
  const complaint = error
    ?? (short
      ? `${minLength - password.length} more character${minLength - password.length === 1 ? '' : 's'}.`
      : mismatch ? 'The two entries do not match.' : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (password !== confirm) return setError('The two entries do not match.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/users/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? 'That did not save.');
        return;
      }
      window.location.href = '/sign-in?set=1';
    } catch {
      setError('No connection. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="auth-fields">
        <PasswordField
          name="password" label="New password" required autoFocus
          minLength={minLength} autoComplete="new-password"
          invalid={short || !!error}
          describedBy={complaint ? noteId : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <PasswordField
          name="confirm" label="Again" required autoComplete="new-password"
          invalid={mismatch}
          describedBy={complaint ? noteId : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </div>

      <p className="auth-hint">
        At least {minLength} characters. Length is the only rule — it is the
        property that actually resists guessing.
      </p>

      {complaint && (
        <Errata id={noteId} live={error ? 'assertive' : 'polite'}>{complaint}</Errata>
      )}

      <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
        {busy ? 'Saving' : 'Set password'}
      </button>
    </form>
  );
}
