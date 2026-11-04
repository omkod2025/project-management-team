'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DocIcon from '../../../p/[slug]/docs/doc-icon';
import { problem, wikiCall } from '../../wiki-api';

type Wiki = { id: string; title: string; description: string; archived: boolean; ownerId: string | null; ownerName: string | null };
type Member = { userId: string; name: string; email: string; access: 'read' | 'write' };
type Person = { userId: string; name: string; email: string };
type Run = (work: () => Promise<unknown>, done?: string) => Promise<boolean>;

/**
 * One busy flag, one message line, and a refresh after every change, shared
 * by every section: the server render is the only copy of the settings.
 */
function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const run: Run = async (work, done = 'Saved.') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await work();
      setNotice(done);
      router.refresh();
      return true;
    } catch (err) { setError(problem(err, 'That change was not saved. Reload and try again.')); return false; }
    finally { setBusy(false); }
  };
  return { busy, notice, error, run };
}

const patch = (wikiId: string, body: unknown) => wikiCall(`/api/wikis/${wikiId}`, 'PATCH', body);
const label = (p: Person) => `${p.name} · ${p.email}`;

function NameSection({ wiki, busy, run }: { wiki: Wiki; busy: boolean; run: Run }) {
  const [title, setTitle] = useState(wiki.title);
  const [description, setDescription] = useState(wiki.description);
  return <section className="wiki-settings-section" aria-labelledby="wiki-name-head">
    <h2 id="wiki-name-head">Name and description</h2>
    <form onSubmit={(e) => { e.preventDefault(); void run(() => patch(wiki.id, { action: 'rename', title }), 'Renamed.'); }}>
      <label>Wiki title<input value={title} required maxLength={200} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <button type="submit" disabled={busy || !title.trim() || title.trim() === wiki.title}><DocIcon name="save" />Rename</button>
    </form>
    <form onSubmit={(e) => { e.preventDefault(); void run(() => patch(wiki.id, { action: 'describe', description }), 'Description saved.'); }}>
      <label>Description<textarea value={description} maxLength={1000} rows={3} disabled={busy} onChange={(e) => setDescription(e.target.value)} /></label>
      <button type="submit" disabled={busy || description.trim() === wiki.description}><DocIcon name="save" />Save description</button>
    </form>
  </section>;
}

function MembersSection({ wiki, members, people, busy, run }: { wiki: Wiki; members: Member[]; people: Person[]; busy: boolean; run: Run }) {
  const [userId, setUserId] = useState('');
  const [access, setAccess] = useState<'read' | 'write'>('read');
  const membersUrl = `/api/wikis/${wiki.id}/members`;
  const taken = new Set([...members.map((m) => m.userId), wiki.ownerId]);
  const choices = people.filter((p) => !taken.has(p.userId));
  return <section className="wiki-settings-section" aria-labelledby="wiki-members-head">
    <h2 id="wiki-members-head">Members</h2>
    <p className="docs-muted">Owner: {wiki.ownerName ?? 'Former member'}. The owner always reads and writes, and is not listed here.</p>
    {members.length ? <div className="docs-table-wrap"><table className="docs-table wiki-members">
      <caption className="docs-sr-only">Members of {wiki.title}</caption>
      <thead><tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col"><span className="docs-sr-only">Remove</span></th></tr></thead>
      <tbody>{members.map((m) => <tr key={m.userId}>
        <th scope="row">{m.name}<span className="wiki-row-description">{m.email}</span></th>
        <td><select aria-label={`Access for ${m.name}`} value={m.access} disabled={busy}
          onChange={(e) => void run(() => wikiCall(membersUrl, 'PUT', { userId: m.userId, access: e.target.value }), 'Access changed.')}>
          <option value="read">Read</option><option value="write">Read and write</option>
        </select></td>
        <td><button type="button" disabled={busy} onClick={() => void run(() => wikiCall(membersUrl, 'DELETE', { userId: m.userId }), 'Member removed.')}><DocIcon name="close" />Remove</button></td>
      </tr>)}</tbody>
    </table></div> : <p>Nobody else can see this wiki yet.</p>}
    <form className="wiki-settings-row" onSubmit={(e) => {
      e.preventDefault();
      void run(() => wikiCall(membersUrl, 'PUT', { userId, access }), 'Member added.').then((ok) => { if (ok) setUserId(''); });
    }}>
      <label>Person<select value={userId} required disabled={busy || !choices.length} onChange={(e) => setUserId(e.target.value)}>
        <option value="">{choices.length ? 'Choose a person' : 'Everyone active is already here'}</option>
        {choices.map((p) => <option key={p.userId} value={p.userId}>{label(p)}</option>)}
      </select></label>
      <label>Access<select value={access} disabled={busy} onChange={(e) => setAccess(e.target.value as 'read' | 'write')}>
        <option value="read">Read</option><option value="write">Read and write</option>
      </select></label>
      <button type="submit" className="docs-primary" disabled={busy || !userId}><DocIcon name="plus" />Add member</button>
    </form>
  </section>;
}

function TransferSection({ wiki, people, busy, run }: { wiki: Wiki; people: Person[]; busy: boolean; run: Run }) {
  const [userId, setUserId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const choices = people.filter((p) => p.userId !== wiki.ownerId);
  const chosen = choices.find((p) => p.userId === userId);
  async function transfer() {
    let role = '';
    const ok = await run(async () => { role = (await patch(wiki.id, { action: 'transfer', userId }) as { role: string }).role; }, 'Ownership transferred.');
    // A previous owner stays as a write member, and may no longer manage — or, on an archived wiki, see — it.
    if (ok && role !== 'owner' && role !== 'install') window.location.assign(wiki.archived ? '/wiki' : `/wiki/${wiki.id}`);
    setConfirming(false);
  }
  return <section className="wiki-settings-section" aria-labelledby="wiki-transfer-head">
    <h2 id="wiki-transfer-head">Transfer ownership</h2>
    <p className="docs-muted">The new owner manages members and settings. The current owner stays on as a write member.</p>
    <div className="wiki-settings-row">
      <label>New owner<select value={userId} disabled={busy} onChange={(e) => { setUserId(e.target.value); setConfirming(false); }}>
        <option value="">Choose a person</option>
        {choices.map((p) => <option key={p.userId} value={p.userId}>{label(p)}</option>)}
      </select></label>
      {!confirming && <button type="button" disabled={busy || !chosen} onClick={() => setConfirming(true)}>Transfer…</button>}
    </div>
    {confirming && chosen && <div className="wiki-confirm" role="group" aria-label="Confirm transfer">
      <p>Make {chosen.name} the owner of “{wiki.title}”?</p>
      <div className="docs-actions">
        <button type="button" className="docs-primary" disabled={busy} onClick={() => void transfer()}>Transfer ownership</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}><DocIcon name="close" />Cancel</button>
      </div>
    </div>}
  </section>;
}

function ArchiveSection({ wiki, busy, run }: { wiki: Wiki; busy: boolean; run: Run }) {
  const [confirming, setConfirming] = useState(false);
  return <section className="wiki-settings-section" aria-labelledby="wiki-archive-head">
    <h2 id="wiki-archive-head">{wiki.archived ? 'Restore' : 'Archive'}</h2>
    {wiki.archived ? <>
      <p>This wiki is archived: members cannot see it and nobody can change its pages.</p>
      <button type="button" className="docs-primary" disabled={busy} onClick={() => void run(() => patch(wiki.id, { action: 'restore' }), 'Wiki restored.')}><DocIcon name="history" />Restore wiki</button>
    </> : <>
      <p className="docs-muted">Archiving hides the wiki from its members and stops all changes. You and the install admin can restore it.</p>
      {confirming ? <div className="wiki-confirm" role="group" aria-label="Confirm archive">
        <p>Archive “{wiki.title}”?</p>
        <div className="docs-actions">
          <button type="button" className="docs-primary" disabled={busy}
            onClick={() => void run(() => patch(wiki.id, { action: 'archive' }), 'Wiki archived.').then(() => setConfirming(false))}><DocIcon name="archive" />Archive wiki</button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}><DocIcon name="close" />Cancel</button>
        </div>
      </div> : <button type="button" disabled={busy} onClick={() => setConfirming(true)}><DocIcon name="archive" />Archive…</button>}
    </>}
  </section>;
}

/** Rename and describe, members, transfer and archive — everything here is the owner's or the install admin's. */
export default function WikiSettings({ wiki, members, people }: { wiki: Wiki; members: Member[]; people: Person[] }) {
  const { busy, notice, error, run } = useRunner();
  return <div className="wiki-settings">
    <div className="docs-heading"><div><h1>Settings</h1><p>{wiki.title}</p></div></div>
    <p className="docs-notice" role="status">{notice}</p>
    {error && <p className="docs-error" role="alert">{error}</p>}
    <NameSection wiki={wiki} busy={busy} run={run} />
    <MembersSection wiki={wiki} members={members} people={people} busy={busy} run={run} />
    <TransferSection wiki={wiki} people={people} busy={busy} run={run} />
    <ArchiveSection wiki={wiki} busy={busy} run={run} />
  </div>;
}
