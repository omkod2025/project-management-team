'use client';
import { workApi, type WorkKind } from '@/lib/work-kind';

import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/admin';
import { FIELD_KINDS } from '@/lib/admin-rules';
import type { FieldKind } from '@/lib/node-rules';
import { optionStyle } from '@/lib/option-colors';
import InviteLink, { inviteUrl } from '../../../invite-link';
import '../list.css';
import './settings.css';
import AppHeader from '../../../app-header';
import { projectViews } from '../project-views';
import ConfirmDelete, { TrashIcon } from '../../../confirm-delete';
import ColumnDialog, { type Field } from './column-dialog';
import KindIcon, { KIND_LABEL } from './kind-icon';

/**
 * Administration (T8).
 *
 * One section at a time, chosen from a rail on the left: Columns first,
 * because that is what this page is opened for, and Holidays last, because it
 * is touched a few times a year. The section lives in the address
 * (`#people`), so a reload or a pasted link opens the same one. A column is
 * edited in a dialog; at rest it is one line saying what it is.
 *
 * The three refusals worth knowing before you look for the missing button:
 *
 *   - a column's type cannot be changed (D-31);
 *   - an option is archived, never deleted (D-33); a column is deleted for
 *     good, but the values already on tasks are left alone (D-34c);
 *   - the status column must keep an option marked *closed*, and the project
 *     must keep an admin. Both are guarded on the server as well as here.
 */

type Props = { kind?: WorkKind; settings: Settings; slug: string };

const SECTIONS = ['columns', 'people', 'project', 'holidays'] as const;
type Section = (typeof SECTIONS)[number];

const TITLES: Record<Section, string> = {
  columns: 'Columns', people: 'People', project: 'Project', holidays: 'Holidays',
};

const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v);

/** The section named in the address, followed as it changes. */
function useSection(): Section {
  const [section, setSection] = useState<Section>('columns');
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setSection(isSection(h) ? h : 'columns');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return section;
}

export default function SettingsView({ settings: initial, slug, kind = 'task' }: Props) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which control started the write in flight: only it shows busy. */
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const current = useSection();
  // A defect list has only its columns to administer: no rail for one item.
  const full = kind === 'task';
  const section: Section = full ? current : 'columns';

  const reload = async () => {
    const res = await fetch(workApi(`/api/projects/${s.project.id}/fields`, kind));
    if (res.ok) setS((await res.json()) as Settings);
  };

  /** Every mutation goes the same way: send, surface the refusal, reload. */
  const send = async (url: string, method: string, body?: unknown, source?: string) => {
    setBusy(true);
    setBusyFor(source ?? null);
    setError(null);
    try {
      const res = await fetch(workApi(url, kind), {
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
      setBusyFor(null);
    }
  };

  const year = new Date().getFullYear();
  const counts: Record<Section, number | null> = {
    columns: s.fields.filter((f) => !f.archived).length,
    people: s.members.length,
    project: null,
    holidays: s.holidays.filter((h) => Number(h.date.slice(0, 4)) >= year).length,
  };

  return (
    <div className="book">
      <div className="sheet plain">
        <AppHeader
          title={s.project.name}
          navLabel="Project views"
          views={projectViews(slug, 'Settings', { canSettings: true, defects: kind === 'defect' })}
        />

        {error && <div className="errata">{error}</div>}

        <div className={`settings${full ? '' : ' single'}`} aria-busy={busy}>
          {full && (
            <nav className="settings-rail" aria-label="Settings sections">
              {SECTIONS.map((id) => (
                <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined}>
                  {TITLES[id]}
                  {counts[id] !== null && <span className="count">{counts[id]}</span>}
                </a>
              ))}
            </nav>
          )}

          <div className="settings-panel">
            {section === 'columns' && <Columns s={s} send={send} error={error} busy={busy} busyFor={busyFor} />}
            {section === 'people' && <Members s={s} send={send} busy={busy} busyFor={busyFor} />}
            {section === 'project' && <Project s={s} send={send} busy={busy} busyFor={busyFor} />}
            {section === 'holidays' && <Calendar s={s} send={send} year={year} busy={busy} busyFor={busyFor} />}
          </div>
        </div>
      </div>
    </div>
  );
}

type Send = (url: string, method: string, body?: unknown, source?: string) => Promise<unknown>;
type Busy = { busy: boolean; busyFor: string | null };

/* ================================================================ project */

function Project({ s, send, busy, busyFor }: { s: Settings; send: Send } & Busy) {
  const [name, setName] = useState(s.project.name);

  // The saved name is the truth. If a reload brings back something different
  // from what is in the box — somebody else renamed it, or the server trimmed
  // what was typed — the box follows rather than arguing.
  const [savedName, setSavedName] = useState(s.project.name);
  if (s.project.name !== savedName) { setSavedName(s.project.name); setName(s.project.name); }

  const dirty = name.trim() !== s.project.name && name.trim().length > 0;

  return (
    <section aria-labelledby="settings-project">
      <header className="settings-head">
        <h2 id="settings-project">Project</h2>
      </header>

      <form
        className="settings-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || busy) return;
          void send(`/api/projects/${s.project.id}`, 'PATCH', { name }, 'rename');
        }}
      >
        <input
          className="field-input name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-label="Project name"
        />
        <button type="submit" className="label primary" disabled={!dirty || busy} aria-busy={busyFor === 'rename'}>Rename</button>
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

/** How many option chips a row shows before it says "+n". */
const CHIPS_SHOWN = 3;

function Columns({ s, send, error, busy, busyFor }: { s: Settings; send: Send; error: string | null } & Busy) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const live = s.fields.filter((f) => !f.archived);
  const archived = s.fields.filter((f) => f.archived);
  // Looked up on every render, so the dialog follows each reload — and closes
  // by itself once the column it was editing has been deleted.
  const open = live.find((f) => f.id === editing);
  const doomed = live.find((f) => f.id === deleting);

  return (
    <section aria-labelledby="settings-columns">
      <header className="settings-head">
        <h2 id="settings-columns">Columns</h2>
        <p className="aside">
          A column keeps the type it was created with. To change what one means,
          add a new column and delete the old one — the values already stored
          are shaped for the original type.
        </p>
      </header>

      <ul className="column-list">
        {live.map((f) => (
          <li key={f.id}>
            <ColumnRow f={f} isStatus={s.project.statusFieldId === f.id} onEdit={() => setEditing(f.id)} />
            <button
              type="button"
              className="column-bin"
              aria-label={`Delete column ${f.name}`}
              title="Delete column"
              onClick={() => setDeleting(f.id)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                   strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <form
        className="settings-row add column-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          void send(`/api/projects/${s.project.id}/fields`, 'POST', { name, kind }, 'add-column');
          setName('');
        }}
      >
        <input
          className="field-input name"
          placeholder="New column"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New column name"
        />
        <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value as FieldKind)} aria-label="Type">
          {FIELD_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <button type="submit" className="label primary" disabled={busy} aria-busy={busyFor === 'add-column'}>Add column</button>
      </form>

      {archived.length > 0 && (
        <details className="archived">
          <summary className="label">{archived.length} archived</summary>
          {archived.map((f) => (
            <div className="settings-row" key={f.id}>
              <KindIcon kind={f.kind} />
              <span className="struck">{f.name}</span>
              <span className="kind">{KIND_LABEL[f.kind]}</span>
              <button
                className="label"
                disabled={busy}
                aria-busy={busyFor === `restore:${f.id}`}
                onClick={() => void send(`/api/fields/${f.id}`, 'PATCH', { archived: false }, `restore:${f.id}`)}
              >
                Restore
              </button>
            </div>
          ))}
        </details>
      )}

      {doomed && (
        <ConfirmDelete
          title="Delete column"
          name={doomed.name}
          note="This cannot be undone. Values already entered on tasks are left as they are, but no view shows them again."
          blocked={s.project.statusFieldId === doomed.id
            ? 'This is the status column. Choose a different one in its settings before deleting it.'
            : undefined}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if (await send(`/api/fields/${doomed.id}`, 'DELETE') === null) throw new Error('The column was not deleted.');
            setDeleting(null);
          }}
        >
          <p>It leaves the List and every view, and its options go with it.</p>
        </ConfirmDelete>
      )}

      {open && (
        <ColumnDialog
          f={open}
          isStatus={s.project.statusFieldId === open.id}
          projectId={s.project.id}
          error={error}
          busy={busy}
          busyFor={busyFor}
          send={send}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** One column at rest: what it is and what it offers. Every edit is in the dialog. */
function ColumnRow({ f, isStatus, onEdit }: { f: Field; isStatus: boolean; onEdit: () => void }) {
  const options = f.options.filter((o) => !o.archived);
  const hidden = options.length - CHIPS_SHOWN;

  return (
    <button type="button" className="column-row" onClick={onEdit} aria-label={`Edit column ${f.name}`}>
      <KindIcon kind={f.kind} status={isStatus} />
      <span className="column-name">{f.name}</span>
      <span className="kind">
        {KIND_LABEL[f.kind]}
        {typeof f.settings.currency === 'string' && ` · ${f.settings.currency}`}
        {isStatus && <span className="column-status"> · status</span>}
      </span>
      <span className="column-chips">
        {options.slice(0, CHIPS_SHOWN).map((o) => (
          <span className="pill" key={o.id} style={optionStyle(o.colorIndex)}><span>{o.label}</span></span>
        ))}
        {hidden > 0 && <span className="more">+{hidden}</span>}
      </span>
      <span className="column-edit">Edit</span>
    </button>
  );
}

/* ================================================================ members */

function Members({ s, send, busy, busyFor }: { s: Settings; send: Send } & Busy) {
  const [invite, setInvite] = useState('');
  // The whole address, built here rather than in the markup: `location` is not
  // readable while rendering on the server.
  const [link, setLink] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const leaver = s.members.find((m) => m.userId === leaving);
  const memberIds = new Set(s.members.map((m) => m.userId));
  const outsiders = s.people.filter((p) => !memberIds.has(p.id));

  return (
    <section aria-labelledby="settings-people">
      <header className="settings-head">
        <h2 id="settings-people">People</h2>
        <p className="aside">Who can open this project, and what each of them may change.</p>
      </header>

      {s.members.map((m) => (
        <div className="settings-row" key={m.userId}>
          <span className="who">{m.name}</span>
          <span className="kind">{m.email}</span>
          <select
            className="field-input"
            defaultValue={m.role}
            onChange={(e) => void send(`/api/projects/${s.project.id}/members`, 'POST', {
              userId: m.userId, role: e.target.value,
            }, `role:${m.userId}`)}
            disabled={busyFor === `role:${m.userId}`}
            aria-busy={busyFor === `role:${m.userId}`}
            aria-label={`Role for ${m.name}`}
          >
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            className="delete-control icon-only"
            aria-label={`Delete ${m.name} from this project`}
            title="Delete member"
            onClick={() => setLeaving(m.userId)}
          >
            <TrashIcon />
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
            }, 'add-member')}
            disabled={busyFor === 'add-member'}
            aria-busy={busyFor === 'add-member'}
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
          if (!invite.trim() || busy) return;
          const out = (await send('/api/users', 'POST', {
            projectId: s.project.id, email: invite,
          }, 'invite')) as { token?: string } | null;
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
        <button type="submit" className="label" disabled={busy} aria-busy={busyFor === 'invite'}>Create</button>
      </form>

      {link && (
        <p className="aside token">
          Hand this one-time link to them. It expires in seven days, and they
          choose their own password — you never see it.
          <InviteLink url={link} />
        </p>
      )}

      {leaver && (
        <ConfirmDelete
          title="Delete member"
          name={leaver.name}
          note="Their account stays, and adding them again restores their access."
          onCancel={() => setLeaving(null)}
          onConfirm={async () => {
            await send(`/api/projects/${s.project.id}/members?userId=${leaver.userId}`, 'DELETE');
            setLeaving(null);
          }}
        >
          <p>They lose access to <strong>{s.project.name}</strong>.</p>
        </ConfirmDelete>
      )}
    </section>
  );
}

/* =============================================================== calendar */

function Calendar({ s, send, year, busy, busyFor }: { s: Settings; send: Send; year: number } & Busy) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [dropping, setDropping] = useState<string | null>(null);
  const dropped = s.holidays.find((h) => h.date === dropping);
  const shown = s.holidays.filter((h) => Number(h.date.slice(0, 4)) >= year);

  return (
    <section aria-labelledby="settings-holidays">
      <header className="settings-head">
        <h2 id="settings-holidays">Holidays</h2>
        <p className="aside">
          These decide what counts as a working day, so they change every
          duration and every variance figure in the project. Thai public holidays
          are announced and amended during the year — this table is data for
          exactly that reason.
        </p>
      </header>

      {shown.map((h) => (
        <div className="settings-row" key={h.date}>
          <span className="figure">{h.date}</span>
          <span className="who">{h.name}</span>
          <button
            className="delete-control icon-only"
            aria-label={`Delete holiday ${h.date}`}
            title="Delete holiday"
            onClick={() => setDropping(h.date)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      <form
        className="settings-row add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || !name.trim() || busy) return;
          void send('/api/holidays', 'POST', { projectId: s.project.id, date, name }, 'add-holiday');
          setDate('');
          setName('');
        }}
      >
        <input className="field-input figure" type="date" value={date}
               onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" />
        <input className="field-input" placeholder="Name" value={name}
               onChange={(e) => setName(e.target.value)} aria-label="Holiday name" />
        <button type="submit" className="label" disabled={busy} aria-busy={busyFor === 'add-holiday'}>Add</button>
      </form>

      {dropped && (
        <ConfirmDelete
          title="Delete holiday"
          name={dropped.name}
          note="It becomes a working day again, which moves every duration and variance that spans it."
          onCancel={() => setDropping(null)}
          onConfirm={async () => {
            await send(`/api/holidays?projectId=${s.project.id}&date=${dropped.date}`, 'DELETE');
            setDropping(null);
          }}
        >
          <p className="figure">{dropped.date}</p>
        </ConfirmDelete>
      )}
    </section>
  );
}
