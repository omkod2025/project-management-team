'use client';

import { useState } from 'react';
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
  const [leaving, setLeaving] = useState<Member | null>(null);
  const membersUrl = `/api/wikis/${wiki.id}/members`;
  const taken = new Set([...members.map((m) => m.userId), wiki.ownerId]);
  const choices = people.filter((p) => !taken.has(p.userId));
  return <section className="wiki-settings-section" aria-labelledby="wiki-members-head">
    <h2 id="wiki-members-head">Members</h2>
    <p className="docs-muted">Owner: {wiki.ownerName ?? 'Former member'}. The owner always reads and writes, and is not listed here.</p>
    {members.length ? <div className="docs-table-wrap"><table className="docs-table wiki-members">
      <caption className="docs-sr-only">Members of {wiki.title}</caption>
      <thead><tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col"><span className="docs-sr-only">Delete</span></th></tr></thead>
      <tbody>{members.map((m) => <tr key={m.userId}>
        <th scope="row">{m.name}<span className="wiki-row-description">{m.email}</span></th>
        <td><select aria-label={`Access for ${m.name}`} value={m.access} disabled={busy}
          onChange={(e) => void run(() => wikiCall(membersUrl, 'PUT', { userId: m.userId, access: e.target.value }), 'Access changed.')}>
          <option value="read">Read</option><option value="write">Read and write</option>
        </select></td>
        <td><button type="button" className="delete-control icon-only" aria-label={`Delete ${m.name}`} title="Delete member" disabled={busy} onClick={() => setLeaving(m)}><TrashIcon /></button></td>
      </tr>)}</tbody>
    </table></div> : <p>Nobody else can see this wiki yet.</p>}
    {leaving && <ConfirmDelete title="Delete member" name={leaving.name}
      note="Adding them again restores their access." onCancel={() => setLeaving(null)}
      onConfirm={async () => { await run(() => wikiCall(membersUrl, 'DELETE', { userId: leaving.userId }), 'Member removed.'); setLeaving(null); }}>
      <p>They can no longer see <strong>{wiki.title}</strong>.</p>
    </ConfirmDelete>}
    <h3 id="wiki-member-add-head">Add a member</h3>
    <form className="wiki-settings-row" aria-labelledby="wiki-member-add-head" onSubmit={(e) => {
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

/**
 * The whole-wiki public link (spec §5b). The state is said plainly every time
 * the screen opens: a wiki that is out there says so. Revoking deletes the
 * secret; publishing again gives a different link.
 */
function PublicLinkSection({ wiki, busy, run }: { wiki: Wiki; busy: boolean; run: Run }) {
  const [copyState, setCopyState] = useState('');
  const href = wiki.publicToken ? `/w/${wiki.publicToken}` : null;
  return <section className="wiki-settings-section" aria-labelledby="wiki-public-head">
    <h2 id="wiki-public-head">Public link</h2>
    {wiki.archived ? <p className="docs-muted">Private. An archived wiki cannot be published; restore it first.</p>
      : href ? <>
        <p><strong>Published.</strong> Anyone with this link can read every page of this wiki. They see no members, authors or owner.</p>
        <p className="wiki-public-link"><code>{href}</code></p>
        <div className="docs-actions">
          <button type="button" disabled={busy} onClick={() => {
            void navigator.clipboard.writeText(`${location.origin}${href}`)
              .then(() => setCopyState('Public link copied.'))
              .catch(() => setCopyState('Could not copy the link. Open it and copy it from the address bar.'));
          }}><DocIcon name="link" />Copy link</button>
          <a href={href} target="_blank" rel="noopener noreferrer"><DocIcon name="file" />Open link</a>
          <button type="button" disabled={busy}
            onClick={() => { setCopyState(''); void run(() => patch(wiki.id, { action: 'unpublish' }), 'Link revoked. It no longer works.'); }}><DocIcon name="lock" />Revoke (unpublish)</button>
        </div>
        <p className="docs-notice" role="status">{copyState}</p>
      </> : <>
        <p><strong>Private.</strong> Only members can read this wiki. Publishing makes a read-only link to the whole wiki that works without signing in.</p>
        <button type="button" disabled={busy} onClick={() => void run(() => patch(wiki.id, { action: 'publish' }), 'Published.')}><DocIcon name="link" />Publish</button>
      </>}
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

/**
 * "Allow my token" (spec §6a): the writer's own live tokens, ticked when they
 * already read this wiki. Saving sends the whole ticked set.
 */
function AllowTokenSection({ wiki, tokens, busy, run }: { wiki: Wiki; tokens: MyToken[]; busy: boolean; run: Run }) {
  const [chosen, setChosen] = useState(() => tokens.filter((t) => t.allowed).map((t) => t.id));
  const saved = tokens.filter((t) => t.allowed).map((t) => t.id);
  const changed = chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));
  return <section className="wiki-settings-section" aria-labelledby="wiki-tokens-head">
    <h2 id="wiki-tokens-head">Allow my token</h2>
    {tokens.length ? <form onSubmit={(e) => {
      e.preventDefault();
      void run(() => wikiCall(`/api/wikis/${wiki.id}/tokens`, 'PUT', { tokenIds: chosen }), 'Your tokens were updated.');
    }}>
      <fieldset className="wiki-token-wikis" disabled={busy}>
        <legend>Your tokens that may read this wiki</legend>
        {tokens.map((t) => <label key={t.id}>
          <input type="checkbox" checked={chosen.includes(t.id)}
            onChange={(e) => setChosen(e.target.checked ? [...chosen, t.id] : chosen.filter((id) => id !== t.id))} />
          <span>{t.label} <code className="wiki-token-prefix">pmw_{t.prefix}…</code></span>
        </label>)}
      </fieldset>
      <button type="submit" disabled={busy || !changed}><DocIcon name="save" />Save</button>
    </form> : <p className="docs-muted">You have no active tokens. Make one on the <Link href="/wiki/tokens">Tokens / MCP</Link> page.</p>}
  </section>;
}

/**
 * Rename and describe, members, transfer, the public link and archive are the
 * owner's or the install admin's; delete is the install admin's alone (D-82);
 * "Allow my token" is every writer's. Each viewer is drawn only the sections
 * they can use.
 */
export default function WikiSettings({ wiki, canManage, canDelete, members, people, tokens }: {
  wiki: Wiki; canManage: boolean; canDelete: boolean; members: Member[]; people: Person[]; tokens: MyToken[] | null;
}) {
  const { busy, notice, error, run } = useRunner();
  return <div className="wiki-settings">
    <div className="docs-heading"><div><h1>Settings</h1><p>{wiki.title}</p></div></div>
    <p className="docs-notice" role="status">{notice}</p>
    {error && <p className="docs-error" role="alert">{error}</p>}
    {canManage && <>
      <NameSection wiki={wiki} busy={busy} run={run} />
      <MembersSection wiki={wiki} members={members} people={people} busy={busy} run={run} />
      <TransferSection wiki={wiki} people={people} busy={busy} run={run} />
      <PublicLinkSection wiki={wiki} busy={busy} run={run} />
    </>}
    {tokens && <AllowTokenSection key={tokens.map((t) => `${t.id}:${t.allowed}`).join()} wiki={wiki} tokens={tokens} busy={busy} run={run} />}
    {canManage && <ArchiveSection wiki={wiki} busy={busy} run={run} />}
    {canDelete && <DeleteWikiSection wiki={wiki} />}
  </div>;
}
