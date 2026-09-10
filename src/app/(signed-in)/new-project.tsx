'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Start a project from the shelf.
 *
 * The name is the only thing asked for. Columns, members and the status
 * designation are all settings of a project that exists — asking for them here
 * would be a wizard, and a wizard would have to guess at D-35 on the admin's
 * behalf. Sending lands the creator on the empty List, where the next thing
 * they do is add a node.
 */
export default function NewProject() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const out = (await res.json()) as { slug?: string; message?: string };
      if (!res.ok) {
        setError(out.message ?? 'That did not save.');
        return;
      }
      router.push(`/p/${out.slug}`);
    } catch {
      setError('No connection. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        /* The one action the shelf offers, so it takes the inverted ground. */
        className="sh-btn sh-btn-primary"
        onClick={() => {
          setOpen(true);
          // The button is the affordance; the field is where the work is.
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        + New project
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="sh-form">
      <input
        ref={input}
        className="sh-field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Project name"
        aria-label="Project name"
        maxLength={120}
      />
      <button type="submit" className="sh-btn sh-btn-primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create'}
      </button>
      <button type="button" className="sh-btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {/* The errata band from the sheet, in line: same wash, same ink. */}
      {error && <span className="sh-error" role="alert">{error}</span>}
    </form>
  );
}
