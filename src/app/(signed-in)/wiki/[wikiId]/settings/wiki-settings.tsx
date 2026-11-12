'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DocIcon from '../../../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from '../../wiki-api';
import ConfirmDelete, { TrashIcon } from '../../../confirm-delete';
import DeleteWikiSection from './delete-wiki';

type Wiki = { id: string; title: string; description: string; archived: boolean; ownerId: string | null; ownerName: string | null; publicToken: string | null };
type Member = { userId: string; name: string; email: string; access: 'read' | 'write' };
type Person = { userId: string; name: string; email: string };
type MyToken = { id: string; label: string; prefix: string; allowed: boolean };
/** `key` names the control that started the change, so only it reads busy. */
type Run = (work: () => Promise<unknown>, done?: string, key?: string) => Promise<boolean>;
type Busy = { wiki: Wiki; busy: boolean; working: string | null; run: Run };

/**
 * One busy flag, one message line, and a refresh after every change, shared
 * by every section: the server render is the only copy of the settings.
 * `working` is the key of the change in flight, for that one control's spinner.
 */
function useRunner() {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const busy = working !== null;
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const run: Run = async (work, done = 'Saved.', key = 'change') => {
    setWorking(key); setError(''); setNotice('');
    try {
      await work();
      setNotice(done);
      router.refresh();
      return true;
    } catch (err) { setError(problem(err, 'That change was not saved. Reload and try again.')); return false; }
    finally { setWorking(null); }
  };
  return { busy, working, notice, error, run };
}

const patch = (wikiId: string, body: unknown) => wikiCall(`/api/wikis/${wikiId}`, 'PATCH', body);
const label = (p: Person) => `${p.name} · ${p.email}`;

function GeneralSection({ wiki, busy, working, run }: Busy) {
  const [title, setTitle] = useState(wiki.title);
  const [description, setDescription] = useState(wiki.description);
  return <section aria-labelledby="wiki-name-head">
    <header className="settings-head">
      <h2 id="wiki-name-head">General</h2>
      <p className="aside">The name and description members see on the wiki index.</p>
    </header>
    <form className="wiki-settings-field" onSubmit={(e) => { e.preventDefault(); void run(() => patch(wiki.id, { action: 'rename', title }), 'Renamed.', 'rename'); }}>
      <label>Wiki title<input value={title} required maxLength={200} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <button type="submit" disabled={busy || !title.trim() || title.trim() === wiki.title} aria-busy={working === 'rename'}><DocIcon name="save" />Rename</button>
    </form>
    <form className="wiki-settings-field stacked" onSubmit={(e) => { e.preventDefault(); void run(() => patch(wiki.id, { action: 'describe', description }), 'Description saved.', 'describe'); }}>
      <label>Description<textarea value={description} maxLength={1000} rows={3} disabled={busy} onChange={(e) => setDescription(e.target.value)} /></label>
      <button type="submit" disabled={busy || description.trim() === wiki.description} aria-busy={working === 'describe'}><DocIcon name="save" />Save description</button>
    </form>
  </section>;
}

/** A ticked set of ids with one id turned on or off — a new Set, never the old one changed. */
function flip(prev: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(prev);
  if (on) next.add(id); else next.delete(id);
  return next;
}

const countOf = (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`;

/** One checkbox that ticks or clears a whole set, and shows a partial one as mixed. */
function SelectAll({ ids, chosen, text, disabled, onChange }: {
  ids: string[]; chosen: ReadonlySet<string>; text: string; disabled: boolean; onChange: (next: Set<string>) => void;
}) {
  const ticked = ids.filter((id) => chosen.has(id)).length;
  const all = ids.length > 0 && ticked === ids.length;
  return <label className="wiki-check wiki-select-all">
    <input type="checkbox" checked={all} disabled={disabled || !ids.length}
      ref={(el) => { if (el) el.indeterminate = ticked > 0 && !all; }}
      onChange={() => {
        const next = new Set(chosen);
        for (const id of ids) { if (all) next.delete(id); else next.add(id); }
        onChange(next);
      }} />
    {text}
  </label>;
}

/**
 * Members as the project's People are drawn: one ruled row each — tick,
 * name, email, access, bin — with the owner first. Tick any number and remove
 * them in one go, or use a row's own bin for one. The ticks are kept as ids
 * and read against the members on screen, so a row that leaves drops out of
 * the selection by itself. Adding, and transfer, sit under hairlines below.
 */
function MembersSection({ wiki, members, people, busy, working, run }: Busy & { members: Member[]; people: Person[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState<Member[] | null>(null);
  const membersUrl = `/api/wikis/${wiki.id}/members`;
  const memberIds = members.map((m) => m.userId);
  const chosen = new Set(memberIds.filter((id) => picked.has(id)));
  const taken = new Set([...memberIds, wiki.ownerId]);
  const choices = people.filter((p) => !taken.has(p.userId));

  async function remove(gone: Member[]) {
    const userIds = gone.map((m) => m.userId);
    const ok = await run(() => wikiCall(membersUrl, 'DELETE', { userIds }), gone.length === 1 ? 'Member removed.' : `${countOf(gone.length)} removed.`, 'remove');
    if (ok) setPicked((prev) => new Set([...prev].filter((id) => !userIds.includes(id))));
    setLeaving(null);
  }

  return <section aria-labelledby="wiki-members-head">
    <header className="settings-head">
      <h2 id="wiki-members-head">Members</h2>
      <p className="aside">Who can open this wiki, and whether they may change its pages.</p>
    </header>
    {members.length > 0 && <div className="wiki-member-bulk" role="group" aria-label="Selected members">
      <SelectAll ids={memberIds} chosen={chosen} text="Select all" disabled={busy} onChange={setPicked} />
      <span className="wiki-member-count" aria-live="polite">{chosen.size ? `${chosen.size} selected` : ''}</span>
      <button type="button" className="delete-control wiki-member-remove" disabled={busy || !chosen.size}
        aria-busy={working === 'remove'} onClick={() => setLeaving(members.filter((m) => chosen.has(m.userId)))}>
        <TrashIcon />{chosen.size ? `Remove ${countOf(chosen.size)}` : 'Remove'}
      </button>
    </div>}
    <ul className="wiki-member-list" aria-label={`Members of ${wiki.title}`}>
      <li className="settings-row">
        {members.length > 0 && <span className="wiki-check-slot" aria-hidden="true" />}
        <span className="who">{wiki.ownerName ?? 'Former member'}</span>
        <span className="kind wiki-member-note">Owner · always reads and writes</span>
      </li>
      {members.map((m) => <li className={chosen.has(m.userId) ? 'settings-row is-picked' : 'settings-row'} key={m.userId}>
        <span className="wiki-check-slot"><input type="checkbox" aria-label={`Select ${m.name}`} checked={chosen.has(m.userId)} disabled={busy}
          onChange={(e) => { const on = e.target.checked; setPicked((prev) => flip(prev, m.userId, on)); }} /></span>
        <span className="who">{m.name}</span>
        <span className="kind wiki-member-note">{m.email}</span>
        <select aria-label={`Access for ${m.name}`} value={m.access} disabled={busy} aria-busy={working === `access:${m.userId}`}
          onChange={(e) => void run(() => wikiCall(membersUrl, 'PUT', { userId: m.userId, access: e.target.value }), 'Access changed.', `access:${m.userId}`)}>
          <option value="read">Read</option><option value="write">Read and write</option>
        </select>
        <button type="button" className="delete-control icon-only" aria-label={`Delete ${m.name}`} title="Delete member" disabled={busy} onClick={() => setLeaving([m])}><TrashIcon /></button>
      </li>)}
    </ul>
    {!members.length && <p className="aside">Nobody else can see this wiki yet.</p>}
    {leaving && <ConfirmDelete title={leaving.length === 1 ? 'Delete member' : 'Delete members'}
      name={leaving.length === 1 ? leaving[0]?.name ?? '' : countOf(leaving.length)}
      note="Adding them again restores their access." onCancel={() => setLeaving(null)} onConfirm={() => remove(leaving)}>
      <p>{leaving.length === 1 ? 'They' : 'These people'} can no longer see <strong>{wiki.title}</strong>.</p>
      {leaving.length > 1 && <ul className="wiki-leaving-list">{leaving.map((m) => <li key={m.userId}>{label(m)}</li>)}</ul>}
    </ConfirmDelete>}
    <AddMembers url={membersUrl} choices={choices} busy={busy} working={working} run={run} />
    <TransferGroup wiki={wiki} people={people} busy={busy} working={working} run={run} />
  </section>;
}

/**
 * Adding: everyone not yet here, narrowed by name or email, any number
 * ticked, one access for all of them, one request. Ticks outlive the filter,
 * so one search after another can gather people.
 */
function AddMembers({ url, choices, busy, working, run }: Omit<Busy, 'wiki'> & { url: string; choices: Person[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [find, setFind] = useState('');
  const [access, setAccess] = useState<'read' | 'write'>('read');
  const chosen = new Set(choices.filter((p) => picked.has(p.userId)).map((p) => p.userId));
  const q = find.trim().toLocaleLowerCase();
  const shown = q ? choices.filter((p) => `${p.name} ${p.email}`.toLocaleLowerCase().includes(q)) : choices;
  const n = chosen.size;

  return <form className="wiki-settings-group wiki-member-add" aria-labelledby="wiki-add-head" onSubmit={(e) => {
    e.preventDefault();
    if (!n) return;
    void run(() => wikiCall(url, 'PUT', { userIds: [...chosen], access }), n === 1 ? 'Member added.' : `${countOf(n)} added.`, 'add')
      .then((ok) => { if (ok) { setPicked(new Set()); setFind(''); } });
  }}>
    <h3 id="wiki-add-head">Add members</h3>
    {choices.length ? <>
      <div className="wiki-member-pick-head">
        <input type="search" value={find} placeholder="Find by name or email" aria-label="Find people to add" disabled={busy}
          onChange={(e) => setFind(e.target.value)} />
        <SelectAll ids={shown.map((p) => p.userId)} chosen={chosen} text={q ? 'Select matches' : 'Select all'} disabled={busy} onChange={setPicked} />
      </div>
      <ul className="wiki-member-pick" aria-label="People to add">
        {shown.map((p) => <li key={p.userId}><label className="wiki-check">
          <input type="checkbox" checked={chosen.has(p.userId)} disabled={busy}
            onChange={(e) => { const on = e.target.checked; setPicked((prev) => flip(prev, p.userId, on)); }} />
          <span className="wiki-pick-name">{p.name}</span><span className="wiki-pick-email">{p.email}</span>
        </label></li>)}
        {!shown.length && <li className="wiki-pick-empty">Nobody matches “{find.trim()}”.</li>}
      </ul>
    </> : <p className="aside">Everyone active is already a member.</p>}
    <div className="settings-row add wiki-member-add-row">
      <span className="wiki-member-count" aria-live="polite">{n ? `${n} selected` : 'Nobody selected'}</span>
      <select aria-label="Access for the new members" value={access} disabled={busy} onChange={(e) => setAccess(e.target.value as 'read' | 'write')}>
        <option value="read">Read</option><option value="write">Read and write</option>
      </select>
      <button type="submit" className="docs-primary" disabled={busy || !n} aria-busy={working === 'add'}>
        <DocIcon name="plus" />{n > 1 ? `Add ${countOf(n)}` : 'Add member'}
      </button>
    </div>
  </form>;
}

function TransferGroup({ wiki, people, busy, working, run }: Busy & { people: Person[] }) {
  const [userId, setUserId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const choices = people.filter((p) => p.userId !== wiki.ownerId);
  const chosen = choices.find((p) => p.userId === userId);
  async function transfer() {
    let role = '';
    const ok = await run(async () => { role = (await patch(wiki.id, { action: 'transfer', userId }) as { role: string }).role; }, 'Ownership transferred.', 'transfer');
    // A previous owner stays as a write member, and may no longer manage — or, on an archived wiki, see — it.
    if (ok && role !== 'owner' && role !== 'install') window.location.assign(wiki.archived ? '/wiki' : `/wiki/${wiki.id}`);
    setConfirming(false);
  }
  return <div className="wiki-settings-group" role="group" aria-labelledby="wiki-transfer-head">
    <h3 id="wiki-transfer-head">Transfer ownership</h3>
    <p className="aside">The new owner manages members and settings. The current owner stays on as a write member.</p>
    <div className="wiki-settings-field">
      <label>New owner<select value={userId} disabled={busy} onChange={(e) => { setUserId(e.target.value); setConfirming(false); }}>
        <option value="">Choose a person</option>
        {choices.map((p) => <option key={p.userId} value={p.userId}>{label(p)}</option>)}
      </select></label>
      {!confirming && <button type="button" disabled={busy || !chosen} onClick={() => setConfirming(true)}>Transfer…</button>}
    </div>
    {confirming && chosen && <div className="wiki-confirm" role="group" aria-label="Confirm transfer">
      <p>Make {chosen.name} the owner of “{wiki.title}”?</p>
      <div className="docs-actions">
        <button type="button" className="docs-primary" disabled={busy} aria-busy={working === 'transfer'} onClick={() => void transfer()}>Transfer ownership</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}><DocIcon name="close" />Cancel</button>
      </div>
    </div>}
  </div>;
}

/**
 * The whole-wiki public link (spec §5b). The state is said plainly every time
 * the screen opens: a wiki that is out there says so. Revoking deletes the
 * secret; publishing again gives a different link.
 */
function PublicLinkSection({ wiki, busy, working, run }: Busy) {
  const [copyState, setCopyState] = useState('');
  const href = wiki.publicToken ? `/w/${wiki.publicToken}` : null;
  return <section aria-labelledby="wiki-public-head">
    <header className="settings-head">
      <h2 id="wiki-public-head">Public link</h2>
      <p className="aside">A read-only link to the whole wiki that works without signing in.</p>
    </header>
    {wiki.archived ? <p className="wiki-settings-state">Private. An archived wiki cannot be published; restore it first.</p>
      : href ? <>
        <p className="wiki-settings-state"><strong>Published.</strong> Anyone with this link can read every page of this wiki. They see no members, authors or owner.</p>
        <p className="wiki-public-link"><code>{href}</code></p>
        <div className="docs-actions">
          <button type="button" disabled={busy} onClick={() => {
            void navigator.clipboard.writeText(`${location.origin}${href}`)
              .then(() => setCopyState('Public link copied.'))
              .catch(() => setCopyState('Could not copy the link. Open it and copy it from the address bar.'));
          }}><DocIcon name="link" />Copy link</button>
          <a href={href} target="_blank" rel="noopener noreferrer"><DocIcon name="file" />Open link</a>
          <button type="button" disabled={busy} aria-busy={working === 'unpublish'}
            onClick={() => { setCopyState(''); void run(() => patch(wiki.id, { action: 'unpublish' }), 'Link revoked. It no longer works.', 'unpublish'); }}><DocIcon name="lock" />Revoke (unpublish)</button>
        </div>
        <p className="docs-notice" role="status">{copyState}</p>
      </> : <>
        <p className="wiki-settings-state"><strong>Private.</strong> Only members can read this wiki.</p>
        <button type="button" className="docs-primary" disabled={busy} aria-busy={working === 'publish'} onClick={() => void run(() => patch(wiki.id, { action: 'publish' }), 'Published.', 'publish')}><DocIcon name="link" />Publish</button>
      </>}
  </section>;
}

/** Archive, and under a hairline delete for good — the owner's or the install admin's (D-82). */
function ArchiveSection({ wiki, canDelete, busy, working, run }: Busy & { canDelete: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return <section aria-labelledby="wiki-archive-head">
    <header className="settings-head">
      <h2 id="wiki-archive-head">{wiki.archived ? 'Restore' : 'Archive'}</h2>
    </header>
    {wiki.archived ? <>
      <p className="wiki-settings-state">This wiki is archived: members cannot see it and nobody can change its pages.</p>
      <button type="button" className="docs-primary" disabled={busy} aria-busy={working === 'restore'} onClick={() => void run(() => patch(wiki.id, { action: 'restore' }), 'Wiki restored.', 'restore')}><DocIcon name="history" />Restore wiki</button>
    </> : <>
      <p className="wiki-settings-state">Archiving hides the wiki from its members and stops all changes. You and the install admin can restore it.</p>
      {confirming ? <div className="wiki-confirm" role="group" aria-label="Confirm archive">
        <p>Archive “{wiki.title}”?</p>
        <div className="docs-actions">
          <button type="button" className="docs-primary" disabled={busy} aria-busy={working === 'archive'}
            onClick={() => void run(() => patch(wiki.id, { action: 'archive' }), 'Wiki archived.', 'archive').then(() => setConfirming(false))}><DocIcon name="archive" />Archive wiki</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}><DocIcon name="close" />Cancel</button>
        </div>
      </div> : <button type="button" disabled={busy} onClick={() => setConfirming(true)}><DocIcon name="archive" />Archive…</button>}
    </>}
    {canDelete && <DeleteWikiSection wiki={wiki} />}
  </section>;
}

/**
 * "Allow my token" (spec §6a): the writer's own live tokens, ticked when they
 * already read this wiki. Saving sends the whole ticked set.
 */
function AllowTokenSection({ wiki, tokens, busy, working, run }: Busy & { tokens: MyToken[] }) {
  const [chosen, setChosen] = useState(() => tokens.filter((t) => t.allowed).map((t) => t.id));
  const saved = tokens.filter((t) => t.allowed).map((t) => t.id);
  const changed = chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));
  return <section aria-labelledby="wiki-tokens-head">
    <header className="settings-head">
      <h2 id="wiki-tokens-head">Allow my token</h2>
      <p className="aside">Which of your access tokens may read this wiki over MCP.</p>
    </header>
    {tokens.length ? <form onSubmit={(e) => {
      e.preventDefault();
      void run(() => wikiCall(`/api/wikis/${wiki.id}/tokens`, 'PUT', { tokenIds: chosen }), 'Your tokens were updated.', 'tokens');
    }}>
      <fieldset className="wiki-token-wikis" disabled={busy}>
        <legend>Your tokens that may read this wiki</legend>
        {tokens.map((t) => <label key={t.id}>
          <input type="checkbox" checked={chosen.includes(t.id)}
            onChange={(e) => setChosen(e.target.checked ? [...chosen, t.id] : chosen.filter((id) => id !== t.id))} />
          <span>{t.label} <code className="wiki-token-prefix">pmw_{t.prefix}…</code></span>
        </label>)}
      </fieldset>
      <button type="submit" className="wiki-settings-save" disabled={busy || !changed} aria-busy={working === 'tokens'}><DocIcon name="save" />Save</button>
    </form> : <p className="wiki-settings-state">You have no active tokens. Make one on the <Link href="/tokens">Tokens / MCP</Link> page.</p>}
  </section>;
}

const TITLES = { general: 'General', members: 'Members', public: 'Public link', tokens: 'Tokens', archive: 'Archive' } as const;
type Section = keyof typeof TITLES;

/**
 * The section named in the address (`#members`), followed as it changes —
 * the project settings' rail, so a reload or a pasted link opens the same
 * one. An address naming a section this viewer is not drawn opens the first.
 */
function useSection(sections: readonly Section[]): Section | undefined {
  const [hash, setHash] = useState('');
  useEffect(() => {
    const read = () => setHash(window.location.hash.slice(1));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return sections.find((id) => id === hash) ?? sections[0];
}

/**
 * Rename and describe, members, transfer, the public link and archive are the
 * owner's or the install admin's, and so is delete (D-82);
 * "Allow my token" is every writer's. Each viewer is drawn only the sections
 * they can use, one at a time, chosen from a rail on the left as the project
 * settings are. A writer has a single section, so no rail.
 */
export default function WikiSettings({ wiki, canManage, canDelete, members, people, tokens }: {
  wiki: Wiki; canManage: boolean; canDelete: boolean; members: Member[]; people: Person[]; tokens: MyToken[] | null;
}) {
  const { busy, working, notice, error, run } = useRunner();
  const sections: Section[] = [
    ...(canManage ? ['general', 'members', 'public'] as const : []),
    ...(tokens ? ['tokens'] as const : []),
    ...(canManage ? ['archive'] as const : []),
  ];
  const section = useSection(sections);
  const rail = sections.length > 1;
  const busyProps = { wiki, busy, working, run };

  return <div className={`wiki-settings${rail ? '' : ' single'}`} aria-busy={busy}>
    {rail && <nav className="settings-rail" aria-label="Settings sections">
      {sections.map((id) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined}>
        {id === 'archive' && wiki.archived ? 'Restore' : TITLES[id]}
        {id === 'members' && <span className="count">{members.length + 1}</span>}
        {id === 'public' && wiki.publicToken && <span className="count">On</span>}
      </a>)}
    </nav>}
    <div className="settings-panel">
      {error && <p className="errata wiki-settings-message" role="alert">{error}</p>}
      <p className="docs-notice wiki-settings-message" role="status">{notice}</p>
      {section === 'general' && <GeneralSection {...busyProps} />}
      {section === 'members' && <MembersSection {...busyProps} members={members} people={people} />}
      {section === 'public' && <PublicLinkSection {...busyProps} />}
      {section === 'tokens' && tokens && <AllowTokenSection key={tokens.map((t) => `${t.id}:${t.allowed}`).join()} {...busyProps} tokens={tokens} />}
      {section === 'archive' && <ArchiveSection {...busyProps} canDelete={canDelete} />}
    </div>
  </div>;
}
