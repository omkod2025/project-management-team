'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The project's name in the page head, renamable in place.
 *
 * The pencil only appears for somebody who can actually use it, and only on
 * hover or focus: the title is read a thousand times for every time it is
 * changed, and a control parked permanently beside it would be louder than the
 * name it edits. It stays visible while the keyboard is on it, because a
 * control that appears only under a pointer does not exist for the keyboard.
 *
 * Committing follows the grid's rename (spec 03 §6b) rather than inventing a
 * second idiom: Enter saves, Escape abandons, and leaving the field saves what
 * is in it. Settings holds the same act with its own explicit button — this is
 * the one for the hand already on the title.
 */
export default function ProjectTitle(
  { projectId, name: initial, canRename }: { projectId: string; name: string; canRename: boolean },
) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setName(initial); }, [initial]);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) return;

    const before = name;
    setName(trimmed);                         // the page reads right immediately
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setName(before);
        setError(err.message ?? 'The name did not save.');
        return;
      }
      // The server trims and may have its own opinion; take what it stored.
      const saved = (await res.json()) as { name?: string };
      if (saved.name) setName(saved.name);
      // The shelf, the other views and the breadcrumb are server-rendered from
      // the old name until this.
      router.refresh();
    } catch {
      setName(before);
      setError('No connection. The name did not save.');
    }
  }

  if (editing) {
    return (
      <input
        ref={input}
        className="title-edit"
        value={draft}
        maxLength={120}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(name); setEditing(false); }
        }}
        autoFocus
      />
    );
  }

  return (
    <span className="title-holder">
      <h1
        onDoubleClick={canRename ? () => { setDraft(name); setEditing(true); } : undefined}
        title={canRename ? 'Double-click to rename' : undefined}
      >
        {name}
      </h1>

      {canRename && (
        <button
          type="button"
          className="title-edit-btn"
          aria-label={`Rename ${name}`}
          onClick={() => { setDraft(name); setEditing(true); }}
        >
          {/* A pencil, drawn rather than fetched: an icon font or an SVG file
              would be a network request for sixteen pixels. */}
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M11.5 1.7l2.8 2.8-8 8-3.6.8.8-3.6 8-8z"
              fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
            />
            <path d="M10.2 3l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      )}

      {error && <span className="title-error">{error}</span>}
    </span>
  );
}
