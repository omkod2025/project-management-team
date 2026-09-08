'use client';

import { useMemo, useState } from 'react';
import type { AccessBoard, PersonAccess } from '@/lib/people';
import { MIN_PASSWORD_LENGTH, PROTECTED_EMAIL, type Role } from '@/lib/admin-rules';
import './people.css';

/**
 * The access board.
 *
 * One grid: a row per person, a column per project the acting user
 * administers, and in each cell the role that person holds there. Access is
 * granted, changed and taken away in the same control — because "member with
 * the wrong role" and "not a member" are the same question asked twice, and
 * splitting them across an Add button and a Remove button is what made the
 * old per-project screen hard to read across projects.
 *
 * Nothing here is authoritative. Every change is a request to the same
 * endpoints project Settings uses, and the server re-checks `member.manage`
 * and the last-admin rule. When it refuses, the select snaps back to what the
 * server still holds rather than keeping an optimistic lie on screen.
 */

/** `member` is the operational role: it can edit everything, archive nothing. */
const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  member: 'Operation',
  viewer: 'View only',
};

const ROLE_NOTE: Record<Role, string> = {
  admin: 'Everything below, plus archiving, columns, people and the calendar.',
  member: 'Create, rename, move and edit tasks, dates and field values.',
  viewer: 'Reads the list, the timeline and the report. Writes nothing.',
};

const NONE = '';

type Props = { board: AccessBoard; actingUserId: string; signOut: React.ReactNode };

export default function PeopleView({ board, actingUserId, signOut }: Props) {
  const [people, setPeople] = useState(board.people);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [invited, setInvited] = useState<{ email: string; token: string | null } | null>(null);
  /** The id of the one row whose Delete is armed. Only ever one at a time. */
  const [arming, setArming] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q))
      : people;
    // People with access first: the board is read far more often to check who
    // holds what than to grant somebody their first project.
    return [...rows].sort((a, b) => {
      const an = Object.keys(a.roles).length === 0 ? 1 : 0;
      const bn = Object.keys(b.roles).length === 0 ? 1 : 0;
      return an - bn || a.name.localeCompare(b.name);
    });
  }, [people, query]);

  /**
   * Set or clear one person's role on one project.
   *
   * Applied to local state first so the grid does not flicker, and rolled back
   * in full on refusal — the last-admin rule (D-17) lives on the server and
   * this is the client learning about it.
   */
  /**
   * Delete an account outright.
   *
   * Armed rather than confirmed in a dialog: the question belongs beside the
   * row it is about, and a modal that interrupts is a modal people learn to
   * click through. There is no undo — the row goes, its memberships cascade,
   * and every task it created loses its author — so the armed state says so
   * before it is answered.
   */
  async function remove(person: PersonAccess) {
    setArming(null);
    setBusy(`del:${person.id}`);
    setFailure(null);
    try {
      const res = await fetch(`/api/users/${person.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string; code?: string };
        setFailure(err.message ?? err.code ?? 'That account was not deleted.');
        return;
      }
      setPeople((ps) => ps.filter((p) => p.id !== person.id));
    } catch {
      setFailure('No connection. That account was not deleted.');
    } finally {
      setBusy(null);
    }
  }

  async function setAccess(person: PersonAccess, projectId: string, role: Role | typeof NONE) {
    const key = `${person.id}:${projectId}`;
    const before = people;
    setBusy(key);
    setFailure(null);

    setPeople((ps) => ps.map((p) => {
      if (p.id !== person.id) return p;
      const roles = { ...p.roles };
      if (role === NONE) delete roles[projectId];
      else roles[projectId] = role;
      return { ...p, roles };
    }));

    try {
      const res = role === NONE
        ? await fetch(`/api/projects/${projectId}/members?userId=${person.id}`, { method: 'DELETE' })
        : await fetch(`/api/projects/${projectId}/members`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId: person.id, role }),
          });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string; code?: string };
        setPeople(before);
        setFailure(err.message ?? err.code ?? 'That change did not save.');
      }
    } catch {
      setPeople(before);
      setFailure('No connection. That change did not save.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Invite: create the account, then grant it the chosen role in one gesture.
   *
   * Two requests rather than one, because creating a person and granting them
   * access are two different permissions and the API keeps them apart. If the
   * grant fails the account still exists — which is recoverable from this very
   * page — so the failure is reported rather than rolled back.
   */
  async function invite(
    email: string, name: string, projectId: string, role: Role, password: string,
  ) {
    setBusy('invite');
    setFailure(null);
    setInvited(null);
    try {
      const made = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Absent unless the admin typed one: an empty string would still be a
        // password as far as the server is concerned, and the two routes in
        // are not interchangeable.
        body: JSON.stringify({ projectId, email, name, ...(password ? { password } : {}) }),
      });
      if (!made.ok) {
        const err = (await made.json()) as { message?: string };
        setFailure(err.message ?? 'That person was not created.');
        return;
      }
      const person = (await made.json()) as { id: string; token: string | null };

      const granted = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: person.id, role }),
      });
      if (!granted.ok) {
        const err = (await granted.json()) as { message?: string };
        setFailure(`${email} was created, but the role did not save: ${err.message ?? 'refused'}`);
      }

      setPeople((ps) => [...ps, {
        id: person.id,
        name: name.trim() || email.split('@')[0]!,
        email: email.trim().toLowerCase(),
        active: true,
        pending: true,
        roles: granted.ok ? { [projectId]: role } : {},
      }]);
      setInvited({ email, token: person.token });
    } catch {
      setFailure('No connection. Nobody was invited.');
    } finally {
      setBusy(null);
    }
  }

  if (board.projects.length === 0) {
    return (
      <main className="people">
        <Head signOut={signOut} />
        <p className="people-empty">
          You do not administer any project, so there is no access to hand out.
          Admin is granted per project — ask an admin of the project you need.
        </p>
      </main>
    );
  }

  return (
    <main className="people">
      <Head signOut={signOut} />

      <div className="people-bar">
        <input
          className="people-search"
          type="search"
          value={query}
          placeholder="Find a person"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a person"
        />
        <span className="people-count">
          <strong>{shown.length}</strong> of {people.length} people ·{' '}
          <strong>{board.projects.length}</strong> project{board.projects.length === 1 ? '' : 's'} you administer
        </span>
      </div>

      {failure && <p className="people-errata">{failure}</p>}

      <div className="people-scroll">
        <table className="board">
          <colgroup>
            <col style={{ width: 300 }} />
            {board.projects.map((p) => <col key={p.id} style={{ width: 176 }} />)}
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="who">Person</th>
              {board.projects.map((p) => (
                <th scope="col" key={p.id}>
                  <a href={`/p/${p.slug}`}>{p.name}</a>
                </th>
              ))}
              {/* Last, and away from the role selects. Access and existence are
                  different questions, and one of the two cannot be undone. */}
              <th scope="col" className="acct">Account</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => (
              <tr key={person.id}>
                <th scope="row" className="who">
                  <span className="who-name">
                    {person.name}
                    {person.id === actingUserId && <span className="you">you</span>}
                  </span>
                  <span className="who-mail">{person.email}</span>
                  {/* Two different kinds of "cannot sign in", and they are not
                      interchangeable: one is waiting for the person, the other
                      was done to them. */}
                  {person.pending && <span className="who-state pending">invite not claimed</span>}
                  {!person.active && <span className="who-state off">deactivated</span>}
                </th>

                {board.projects.map((project) => {
                  const key = `${person.id}:${project.id}`;
                  const role = person.roles[project.id];
                  return (
                    <td key={project.id} className={role ? `has role-${role}` : 'none'}>
                      <select
                        className="role"
                        value={role ?? NONE}
                        disabled={busy === key}
                        title={role ? ROLE_NOTE[role] : 'No access — the project is invisible to them.'}
                        aria-label={`${person.name} on ${project.name}`}
                        onChange={(e) => void setAccess(
                          person, project.id, e.target.value as Role | typeof NONE,
                        )}
                      >
                        <option value={NONE}>No access</option>
                        {(['admin', 'member', 'viewer'] as Role[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}

                <td className="acct">
                  <DeleteCell
                    person={person}
                    protectedAccount={person.email.toLowerCase() === PROTECTED_EMAIL}
                    isSelf={person.id === actingUserId}
                    armed={arming === person.id}
                    busy={busy === `del:${person.id}`}
                    onArm={() => setArming(person.id)}
                    onCancel={() => setArming(null)}
                    onConfirm={() => void remove(person)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Invite projects={board.projects} busy={busy === 'invite'} onInvite={invite} />

      {invited && (invited.token ? (
        <p className="people-token">
          <strong>{invited.email}</strong> now has access. Hand them this
          one-time link — it expires in seven days and they choose their own
          password, which you never see.
          <code>/set-password?token={invited.token}</code>
        </p>
      ) : (
        <p className="people-token">
          <strong>{invited.email}</strong> now has access with the password you
          set. Tell it to them by some means other than the one you would use
          for anything else, and expect it to leak: two people know it. Their
          first sign-in can reach nothing but the change-password page until
          they have replaced it with one you do not know.
        </p>
      ))}

      <dl className="legend">
        {(['admin', 'member', 'viewer'] as Role[]).map((r) => (
          <div key={r}>
            <dt className={`role-${r}`}>{ROLE_LABEL[r]}</dt>
            <dd>{ROLE_NOTE[r]}</dd>
          </div>
        ))}
        <div>
          <dt>No access</dt>
          <dd>
            The project does not appear on their shelf and a direct link returns
            “not found”. They cannot tell it exists.
          </dd>
        </div>
      </dl>
    </main>
  );
}

/**
 * The Delete control, in its three possible states.
 *
 * The protected and self cases draw a reason rather than a disabled button. A
 * greyed-out button says "not now"; these are never, and the difference is
 * worth a word. The server refuses both regardless — this is the page being
 * honest, not the page being the lock.
 */
function DeleteCell({
  person, protectedAccount, isSelf, armed, busy, onArm, onCancel, onConfirm,
}: {
  person: PersonAccess;
  protectedAccount: boolean;
  isSelf: boolean;
  armed: boolean;
  busy: boolean;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (protectedAccount) {
    return <span className="acct-locked" title="The install account. It cannot be deleted.">install account</span>;
  }
  if (isSelf) {
    return <span className="acct-locked">your account</span>;
  }
  if (busy) return <span className="acct-locked">deleting…</span>;

  if (armed) {
    return (
      <span className="acct-armed">
        <button className="acct-yes" onClick={onConfirm}>Delete for good</button>
        <button className="acct-no" onClick={onCancel}>Cancel</button>
      </span>
    );
  }

  return (
    <button
      className="acct-del"
      onClick={onArm}
      aria-label={`Delete ${person.name}'s account`}
      title="Removes the account, every membership it holds, and its name from every task it created."
    >
      Delete
    </button>
  );
}

function Head({ signOut }: { signOut: React.ReactNode }) {
  return (
    <header className="people-head">
      <a className="shelf-link" href="/">‹ Field Book</a>
      <h1>People and access</h1>
      {/* Both of these change what level you are on rather than what you are
          looking at, so they share the head's edge. */}
      <div className="people-out">{signOut}</div>
    </header>
  );
}

function Invite({
  projects, busy, onInvite,
}: {
  projects: AccessBoard['projects'];
  busy: boolean;
  onInvite: (
    email: string, name: string, projectId: string, role: Role, password: string,
  ) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState(projects[0]!.id);
  const [role, setRole] = useState<Role>('member');
  const [password, setPassword] = useState('');
  const [withPassword, setWithPassword] = useState(false);

  return (
    <form
      className="invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim()) return;
        void onInvite(email, name, projectId, role, withPassword ? password : '')
          .then(() => { setEmail(''); setName(''); setPassword(''); });
      }}
    >
      <h2>Invite someone</h2>
      <div className="invite-row">
        <input
          type="email" required value={email} placeholder="name@company.com"
          onChange={(e) => setEmail(e.target.value)} aria-label="Email address"
        />
        <input
          type="text" value={name} placeholder="Full name (optional)"
          onChange={(e) => setName(e.target.value)} aria-label="Full name"
        />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
          {(['admin', 'member', 'viewer'] as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <button type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Invite'}</button>
      </div>

      {/* The default is the link, and it is the default because it is the only
          one of the two where nobody but the owner ever knows the password.
          The other exists for people who will not receive a link. */}
      <label className="invite-choice">
        <input
          type="checkbox"
          checked={withPassword}
          onChange={(e) => setWithPassword(e.target.checked)}
        />
        Set a starting password instead of sending a link
      </label>

      {withPassword && (
        <div className="invite-row">
          <input
            type="text"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            placeholder={`Starting password — at least ${MIN_PASSWORD_LENGTH} characters`}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Starting password"
          />
        </div>
      )}

      <p className="invite-note">
        They are invited to one project to begin with. Add the rest in the grid
        above — access is held per project, so there is no account-wide setting
        to get wrong.
        {withPassword
          ? ' A password you set is one two people know, so the account can do'
            + ' nothing but change it until they have. Say it out loud rather'
            + ' than writing it where it will sit.'
          : ' The link expires in seven days and the password they choose is'
            + ' never seen by you or by anybody else.'}
      </p>
    </form>
  );
}
