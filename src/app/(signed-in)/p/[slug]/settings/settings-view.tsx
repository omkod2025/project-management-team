'use client';

import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/admin';
import { FIELD_KINDS, STAGES } from '@/lib/admin-rules';
import InviteLink, { inviteUrl } from '../../../invite-link';
import '../list.css';
import './settings.css';
import Bell from '../../../bell';

/**
 * Administration (T8).
 *
 * Same page, same rules: ruled rows, no cards, archive rather than delete.
 * The three refusals worth knowing before you look for the missing button:
 *
 *   - a column's type cannot be changed (D-31);
 *   - a column and an option are archived, never deleted (D-33, D-34);
 *   - the status column must keep an option marked *closed*, and the project
 *     must keep an admin. Both are guarded on the server as well as here.
 */

type Props = { settings: Settings; slug: string };

export default function SettingsView({ settings: initial, slug }: Props) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await fetch(`/api/projects/${s.project.id}/fields`);
    if (res.ok) setS((await res.json()) as Settings);
  };

  /** Every mutation goes the same way: send, surface the refusal, reload. */
  const send = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? 'That did not save.');
        return null;
      }
      const out = await res.json().catch(() => null);
      await reload();
      return out;
    } catch {
      setError('No connection. Nothing was saved.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="book">
      <div className="sheet plain">
        <header className="head">
          {/* Up a level, to the shelf. Deliberately not in the view nav
              beside List / Timeline / Report: those are views *of this
              project* and this is the way out of it — filing a level change
              among sibling views because the two sit near each other is the
              grouping-by-adjacency this page has been unpicking. */}
          <a className="shelf label" href="/">‹ Home</a>
          <h1>{s.project.name}</h1>
          {/* The bell stands immediately before the view nav, so notice and
              navigation sit together in the one cluster this header already
              uses for "where do I go from here" (spec 11 §6). */}
          <Bell />
          <div className="views label">
            <a href={`/p/${slug}`}>List</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <a href={`/p/${slug}/timeline`}>Timeline</a>
            <span style={{ color: 'var(--color-rule)' }}>·</span>
            <span aria-current="page">Settings</span>
            <a href={`/p/${slug}/docs`}>Docs</a>
          </div>
        </header>

        {error && <div className="errata">{error}</div>}

        <div className="settings" aria-busy={busy}>
          <Project s={s} send={send} />
          <Columns s={s} send={send} />
          <Members s={s} send={send} />
          <Calendar s={s} send={send} />
        </div>
      </div>
    </div>
  );
}

type Send = (url: string, method: string, body?: unknown) => Promise<unknown>;

/* ================================================================ project */

function Project({ s, send }: { s: Settings; send: Send }) {
  const [name, setName] = useState(s.project.name);

  // The saved name is the truth. If a reload brings back something different
  // from what is in the box — somebody else renamed it, or the server trimmed
  // what was typed — the box follows rather than arguing.
  useEffect(() => { setName(s.project.name); }, [s.project.name]);

  const dirty = name.trim() !== s.project.name && name.trim().length > 0;

  return (
    <section>
      <h2 className="label">Project</h2>

      <form
        className="settings-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          void send(`/api/projects/${s.project.id}`, 'PATCH', { name });
        }}
      >
        <input
          className="field-input name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-label="Project name"
        />
        <button type="submit" className="label primary" disabled={!dirty}>Rename</button>
      </form>

      <p className="aside">
        A rename changes the label, not where the project lives — the address
        stays as it is, so a link somebody pasted into a chat last month still
        opens it.
        <code>/p/{s.project.slug}</code>
      </p>
    </section>
  );
}

/* ================================================================ columns */

function Columns({ s, send }: { s: Settings; send: Send }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('text');
  const live = s.fields.filter((f) => !f.archived);
  const archived = s.fields.filter((f) => f.archived);

  return (
    <section>
      <h2 className="label">Columns</h2>

      <p className="aside">
        A column keeps the type it was created with. To change what one means,
        add a new column and archive the old one — the values already stored
        are shaped for the original type.
      </p>

      {live.map((f) => (
        <Field key={f.id} f={f} s={s} send={send} />
      ))}

      <form
        className="settings-row add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void send(`/api/projects/${s.project.id}/fields`, 'POST', { name, kind });
          setName('');
        }}
      >
        <input
          className="field-input"
          placeholder="New column"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New column name"
        />
        <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          {FIELD_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
        </select>
        <button type="submit" className="label primary">Add</button>
      </form>

      {archived.length > 0 && (
        <details className="archived">
          <summary className="label">{archived.length} archived</summary>
          {archived.map((f) => (
            <div className="settings-row" key={f.id}>
              <span className="struck">{f.name}</span>
              <span className="kind label">{f.kind.replace('_', ' ')}</span>
              <button className="label" onClick={() => void send(`/api/fields/${f.id}`, 'PATCH', { archived: false })}>
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function Field({ s, f, send }: { s: Settings; f: Settings['fields'][number]; send: Send }) {
  const [label, setLabel] = useState('');
  const isStatus = s.project.statusFieldId === f.id;
  const hasOptions = f.kind === 'select' || f.kind === 'multi_select';

  return (
    <div className="field-block">
      <div className="settings-row">
        <input
          className="field-input name"
          defaultValue={f.name}
          onBlur={(e) => e.target.value !== f.name && void send(`/api/fields/${f.id}`, 'PATCH', { name: e.target.value })}
          aria-label="Column name"
        />
        <span className="kind label">{f.kind.replace('_', ' ')}</span>
        {typeof f.settings.currency === 'string' && <span className="kind label">{f.settings.currency}</span>}

        {f.kind === 'select' && (
          <button
            className={`label${isStatus ? ' primary' : ''}`}
            title="Only a single-select column can drive automatic actual dates"
            onClick={() => void send(`/api/projects/${s.project.id}`, 'PATCH', {
              statusFieldId: isStatus ? null : f.id,
            })}
          >
            {isStatus ? 'Status column' : 'Make status column'}
          </button>
        )}

        <button className="label" onClick={() => void send(`/api/fields/${f.id}`, 'PATCH', { archived: true })}>
          Archive
        </button>
      </div>

      {hasOptions && (
        <div className="options">
          {f.options.map((o) => (
            <div className={`settings-row option${o.archived ? ' is-archived' : ''}`} key={o.id}>
              <span className="swatch" style={{ ['--opt-hue' as string]: `var(--color-tab-${o.colorIndex})` }} />
              <input
                className="field-input"
                defaultValue={o.label}
                onBlur={(e) => e.target.value !== o.label && void send(`/api/options/${o.id}`, 'PATCH', { label: e.target.value })}
                aria-label="Option label"
              />
              {isStatus && (
                <select
                  className="field-input stage-select"
                  defaultValue={o.stage ?? ''}
                  onChange={(e) => void send(`/api/options/${o.id}`, 'PATCH', { stage: e.target.value })}
                  aria-label="Stage"
                >
                  <option value="">no stage</option>
                  {STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st === 'notStarted' ? 'not started' : st === 'inProgress' ? 'running' : 'closed'}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="label"
                onClick={() => void send(`/api/options/${o.id}`, 'PATCH', { archived: !o.archived })}
              >
                {o.archived ? 'Restore' : 'Archive'}
              </button>
            </div>
          ))}

          <form
            className="settings-row add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) return;
              void send(`/api/fields/${f.id}/options`, 'POST', {
                label,
                colorIndex: (f.options.length % 6) + 1,
              });
              setLabel('');
            }}
          >
            <input
              className="field-input"
              placeholder="New option"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="New option label"
            />
            <button type="submit" className="label">Add</button>
          </form>
        </div>
      )}

      {isStatus && (
        <p className="aside">
          The stage on each option is what sets actual dates: the first move into
          <em> running </em> records a start, and <em> closed </em> records an end.
          An option with no stage records nothing, which is what makes a
          cancelled task safe.
        </p>
      )}
    </div>
  );
}

/* ================================================================ members */

function Members({ s, send }: { s: Settings; send: Send }) {
  const [invite, setInvite] = useState('');
  // The whole address, built here rather than in the markup: `location` is not
  // readable while rendering on the server.
  const [link, setLink] = useState<string | null>(null);
  const memberIds = new Set(s.members.map((m) => m.userId));
  const outsiders = s.people.filter((p) => !memberIds.has(p.id));

  return (
    <section>
      <h2 className="label">People</h2>

      {s.members.map((m) => (
        <div className="settings-row" key={m.userId}>
          <span className="who">{m.name}</span>
          <span className="kind">{m.email}</span>
          <select
            className="field-input"
            defaultValue={m.role}
            onChange={(e) => void send(`/api/projects/${s.project.id}/members`, 'POST', {
              userId: m.userId, role: e.target.value,
            })}
            aria-label={`Role for ${m.name}`}
          >
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            className="label"
            onClick={() => void send(`/api/projects/${s.project.id}/members?userId=${m.userId}`, 'DELETE')}
          >
            Remove
          </button>
        </div>
      ))}

      {outsiders.length > 0 && (
        <div className="settings-row add">
          <select
            className="field-input"
            defaultValue=""
            onChange={(e) => e.target.value && void send(`/api/projects/${s.project.id}/members`, 'POST', {
              userId: e.target.value, role: 'member',
            })}
            aria-label="Add someone already in the system"
          >
            <option value="">Add someone…</option>
            {outsiders.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.email}</option>)}
          </select>
        </div>
      )}

      <form
        className="settings-row add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!invite.trim()) return;
          const out = (await send('/api/users', 'POST', {
            projectId: s.project.id, email: invite,
          })) as { token?: string } | null;
          if (out?.token) setLink(inviteUrl(out.token));
          setInvite('');
        }}
      >
        <input
          className="field-input"
          type="email"
          placeholder="Create a person by email"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          aria-label="New person's email"
        />
        <button type="submit" className="label">Create</button>
      </form>

      {link && (
        <p className="aside token">
          Hand this one-time link to them. It expires in seven days, and they
          choose their own password — you never see it.
          <InviteLink url={link} />
        </p>
      )}
    </section>
  );
}

/* =============================================================== calendar */

function Calendar({ s, send }: { s: Settings; send: Send }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const year = new Date().getFullYear();
  const shown = s.holidays.filter((h) => Number(h.date.slice(0, 4)) >= year);

  return (
    <section>
      <h2 className="label">Holidays</h2>

      <p className="aside">
        These decide what counts as a working day, so they change every
        duration and every variance figure in the project. Thai public holidays
        are announced and amended during the year — this table is data for
        exactly that reason.
      </p>

      {shown.map((h) => (
        <div className="settings-row" key={h.date}>
          <span className="figure">{h.date}</span>
          <span className="who">{h.name}</span>
          <button
            className="label"
            onClick={() => void send(`/api/holidays?projectId=${s.project.id}&date=${h.date}`, 'DELETE')}
          >
            Remove
          </button>
        </div>
      ))}

      <form
        className="settings-row add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || !name.trim()) return;
          void send('/api/holidays', 'POST', { projectId: s.project.id, date, name });
          setDate('');
          setName('');
        }}
      >
        <input className="field-input figure" type="date" value={date}
               onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
        <input className="field-input" placeholder="Name" value={name}
               onChange={(e) => setName(e.target.value)} aria-label="Holiday name" />
        <button type="submit" className="label">Add</button>
      </form>
    </section>
  );
}
