'use client';

import { useState } from 'react';
import type { Profile } from '@/lib/admin';
import type { Role } from '@/lib/admin-rules';
import './profile.css';

/**
 * Your own account, in three blocks: who you are, how you sign in, and what you
 * can reach.
 *
 * Only the first is editable, and only its name. The address identifies the
 * account and the roles belong to whoever administers each project — both are
 * drawn here as fact, with a sentence saying whose they are, because "you
 * cannot change this" is more useful than the field's absence.
 *
 * The name is saved through `PATCH /api/users/me` rather than a server action:
 * a server action would re-render the page and take the caret with it, and this
 * is a field somebody edits and re-edits until it looks right.
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  member: 'Operation',
  viewer: 'View only',
};

/** Thai renders in the name field; it must never be tracked or uppercased. */
const THAI = /[฀-๿]/;

/**
 * Initials for the monogram, where a photograph would go.
 *
 * A grapheme is a base character plus whatever marks hang off it, which is the
 * only definition that survives Thai: `ก` and `กั` are one letter each, and
 * slicing two code units off a Thai name can hand back a floating tone mark.
 */
function monogram(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0]!;
  const cluster = (s: string) => s.match(/^\P{M}\p{M}*/u)?.[0] ?? '';
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const marks = words.length > 1
    ? cluster(words[0]!) + cluster(words[1]!)
    : cluster(source) + cluster(source.slice(cluster(source).length));
  return THAI.test(marks) ? marks : marks.toUpperCase();
}

type Props = { profile: Profile; signOut: React.ReactNode };

export default function ProfileView({ profile, signOut }: Props) {
  /** What the server holds. `draft` is what the field shows. */
  const [name, setName] = useState(profile.name);
  const [draft, setDraft] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = draft.trim() !== name && draft.trim().length > 0;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: draft }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string; code?: string };
        setFailure(err.message ?? err.code ?? 'That name did not save.');
        return;
      }
      // The server trims; taking its answer rather than the draft keeps the
      // field showing what is actually stored.
      const { name: stored } = (await res.json()) as { name: string };
      setName(stored);
      setDraft(stored);
      setSaved(true);
    } catch {
      setFailure('No connection. That name did not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="prof">
      <div className="prof-sheet">
        <header className="prof-head">
          <div>
            <h1>Your profile</h1>
            <p className="prof-sub">
              The name everybody else reads you by, and the password you sign in
              with. Your access is listed below — it is held per project, and
              granted there.
            </p>
          </div>
          <div className="prof-out">
            <a className="shelf-link" href="/">‹ Home</a>
            {signOut}
          </div>
        </header>

        <div className="prof-id">
          <span className="prof-mark" aria-hidden="true">{monogram(name, profile.email)}</span>
          <span className="prof-id-lines">
            <span className="prof-id-name" lang={THAI.test(name) ? 'th' : undefined}>{name}</span>
            <span className="prof-id-mail">{profile.email}</span>
          </span>
        </div>

        {failure && <p className="prof-errata" role="alert">{failure}</p>}

        <section className="prof-block" aria-labelledby="prof-name">
          <div className="prof-block-head">
            <h2 id="prof-name">Name</h2>
            <p>
              Drawn on every task you are assigned, on your lane in All Timeline and
              beside anything you created. Change it as often as it needs
              changing.
            </p>
          </div>

          <form className="prof-form" onSubmit={(e) => void save(e)}>
            <label className="prof-field">
              <span className="prof-label">Full name</span>
              <input
                type="text"
                required
                maxLength={120}
                value={draft}
                lang={THAI.test(draft) ? 'th' : undefined}
                onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
                aria-label="Full name"
              />
            </label>

            <div className="prof-actions">
              <button type="submit" className="prof-save" disabled={!dirty || busy}>
                {busy ? 'Saving…' : 'Save name'}
              </button>
              {dirty && !busy && (
                <button
                  type="button"
                  className="prof-cancel"
                  onClick={() => { setDraft(name); setSaved(false); }}
                >
                  Cancel
                </button>
              )}
              {/* Said once, and only after a save actually returned. A tick that
                  appears on every keystroke stops meaning anything. */}
              {saved && !dirty && <span className="prof-saved" role="status">Saved</span>}
            </div>
          </form>
        </section>

        <section className="prof-block" aria-labelledby="prof-signin">
          <div className="prof-block-head">
            <h2 id="prof-signin">Signing in</h2>
            <p>
              Your address identifies the account — it is half of what you sign
              in with, so only an admin changes it. Ask one if it is wrong.
            </p>
          </div>

          <dl className="prof-facts">
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Account since</dt>
              <dd className="figure">{profile.since.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>
                <a className="prof-link" href="/change-password">Change your password</a>
                <span className="prof-note">
                  {profile.mustChangePassword
                    ? ' — the password you hold was set by an admin, so two people know it.'
                    : ' — you will be asked to sign in again afterwards.'}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="prof-block" aria-labelledby="prof-access">
          <div className="prof-block-head">
            <h2 id="prof-access">Your access</h2>
            <p>
              Held per project and granted by an admin of that project. Nothing
              here is yours to change — it is listed so you can see it in one
              place.
            </p>
          </div>

          {profile.memberships.length === 0 ? (
            <p className="prof-blank">
              You are not on any project yet. Ask an admin of the one you need
              to add you — until then its link returns “not found”.
            </p>
          ) : (
            <ul className="prof-access">
              {profile.memberships.map((m) => (
                <li key={m.id}>
                  <a href={`/p/${m.slug}`} lang={THAI.test(m.name) ? 'th' : undefined}>{m.name}</a>
                  <span className={`prof-role role-${m.role}`}>{ROLE_LABEL[m.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
