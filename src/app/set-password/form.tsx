'use client';

import { useState } from 'react';

export default function SetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      window.location.href = '/sign-in';
    } catch {
      setError('No connection. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 26 }}>
      <p style={{ color: 'var(--color-ink-graphite-soft)', fontSize: 12.5, marginTop: 0 }}>
        Choose a password of at least {minLength} characters. Length is the only
        rule — it is the property that actually resists guessing.
      </p>

      <label className="label" htmlFor="pw" style={label}>New password</label>
      <input
        id="pw" type="password" required minLength={minLength} autoFocus style={input}
        value={password} onChange={(e) => setPassword(e.target.value)}
      />

      <label className="label" htmlFor="pw2" style={{ ...label, marginTop: 16 }}>Again</label>
      <input
        id="pw2" type="password" required style={input}
        value={confirm} onChange={(e) => setConfirm(e.target.value)}
      />

      {(tooShort || mismatch || error) && (
        <p className="figure" style={{ marginTop: 14, color: 'var(--color-vermilion)' }}>
          {error ?? (tooShort ? `${minLength - password.length} more characters.` : 'The two entries do not match.')}
        </p>
      )}

      <button type="submit" className="label" disabled={busy} style={button}>
        {busy ? 'Saving' : 'Set password'}
      </button>
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
