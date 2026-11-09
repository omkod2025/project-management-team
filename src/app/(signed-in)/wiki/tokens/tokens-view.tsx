'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WikiTokenPermission } from '@/lib/wiki-rules';
import type { TokenRow } from '@/lib/wiki-tokens';
import DocIcon from '../../p/[slug]/docs/doc-icon';
import ConfirmDelete, { TrashIcon } from '../../confirm-delete';
import { problem, wikiCall } from '../wiki-api';

type Wiki = { id: string; title: string };
type Created = { token: TokenRow; secret: string };

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
const stamp = (iso: string | null, none = 'Never') => (iso ? day.format(new Date(iso)) : none);
const STATUS: Record<TokenRow['status'], string> = { active: 'Active', revoked: 'Revoked', expired: 'Expired' };

/** The end of the chosen day in Bangkok, which is the day the person picked. */
const endOfDay = (date: string) => (date ? `${date}T23:59:59+07:00` : null);

function mcpConfig(origin: string, secret: string): string {
  return JSON.stringify({
    mcpServers: { 't-timeline-wiki': { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${secret}` } } },
  }, null, 2);
}

const mcpCommand = (origin: string, secret: string) =>
  `claude mcp add --transport http t-timeline-wiki ${origin}/api/mcp --header "Authorization: Bearer ${secret}"`;

/** One busy flag and one message line, and the server render refreshed after each change. */
function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function run<T>(work: () => Promise<T>, done: string): Promise<T | null> {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await work();
      setNotice(done);
      startRefresh(() => router.refresh());
      return result;
    } catch (err) { setError(problem(err, 'That did not save. Reload and try again.')); return null; }
    finally { setBusy(false); }
  }
  return { busy: busy || refreshing, notice, error, run };
}
type Run = ReturnType<typeof useRunner>['run'];

function WikiChoices({ wikis, chosen, onChange, disabled, legend }: {
  wikis: Wiki[]; chosen: string[]; onChange: (ids: string[]) => void; disabled: boolean; legend: string;
}) {
  return <fieldset className="wiki-token-wikis" disabled={disabled}>
    <legend>{legend}</legend>
    {wikis.length ? wikis.map((w) => <label key={w.id}>
      <input type="checkbox" checked={chosen.includes(w.id)}
        onChange={(e) => onChange(e.target.checked ? [...chosen, w.id] : chosen.filter((id) => id !== w.id))} />
      <span>{w.title}</span>
    </label>) : <p className="docs-muted">You cannot see any wiki yet. A token with no wiki reads nothing.</p>}
  </fieldset>;
}

const PERMISSION_LABELS: Record<WikiTokenPermission, string> = {
  create_wiki: 'Create wiki', create_page: 'Create page', write_wiki: 'Write wiki',
};
const PERMISSION_KEYS: WikiTokenPermission[] = ['create_wiki', 'create_page', 'write_wiki'];
const permissionSummary = (token: TokenRow) => token.permissions.length
  ? token.permissions.map((key) => PERMISSION_LABELS[key]).join(', ') : 'Read only';

function PermissionChoices({ chosen, onChange, disabled }: {
  chosen: WikiTokenPermission[]; onChange: (permissions: WikiTokenPermission[]) => void; disabled: boolean;
}) {
  return <fieldset className="wiki-token-wikis" disabled={disabled}>
    <legend>Optional permissions</legend>
    {PERMISSION_KEYS.map((key) => <label key={key}>
      <input type="checkbox" checked={chosen.includes(key)}
        onChange={(e) => onChange(e.target.checked ? [...chosen, key] : chosen.filter((value) => value !== key))} />
      <span>{PERMISSION_LABELS[key]}</span>
    </label>)}
    <p className="docs-muted">All tokens can list, read and search selected wikis while you can access them. These permissions apply to every selected wiki and never exceed your own access.</p>
    <p className="docs-muted">Write wiki edits existing pages and wiki details; changing wiki details requires owner access. Create page is separate. No token can delete or archive.</p>
    <p className="docs-muted">New wikis created through MCP are added only to this token. Creating pages or editing them still requires the matching permission.</p>
  </fieldset>;
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState('');
  return <div className="wiki-token-snippet">
    <div className="wiki-token-snippet-head">
      <span>{label}</span>
      <button type="button" onClick={() => {
        void navigator.clipboard.writeText(text)
          .then(() => setState('Copied.'))
          .catch(() => setState('Could not copy. Select the text and copy it.'));
      }}><DocIcon name="copy" />Copy</button>
    </div>
    <pre><code>{text}</code></pre>
    <p className="docs-notice" role="status">{state}</p>
  </div>;
}

/**
 * The connection guide, in Thai: the step after copying a token. Beside a
 * secret it opens in a new tab, because leaving this page loses the secret.
 */
export function GuideLink({ newTab = false }: { newTab?: boolean }) {
  return <Link className="wiki-guide-link" href="/wiki/tokens/guide"
    {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><DocIcon name="info" />How to connect</Link>;
}

/** Shown once, straight after creation. Leaving or pressing Done loses it for good. */
function SecretPanel({ created, origin, onDone }: { created: Created; origin: string; onDone: () => void }) {
  return <section className="wiki-token-secret" aria-labelledby="wiki-token-secret-head">
    <h2 id="wiki-token-secret-head">Copy your token now</h2>
    <p>This is the only time “{created.token.label}” is shown in full. It is not stored and cannot be shown again.</p>
    <CopyBlock label="Token" text={created.secret} />
    <CopyBlock label="MCP client config (JSON)" text={mcpConfig(origin, created.secret)} />
    <CopyBlock label="Claude Code" text={mcpCommand(origin, created.secret)} />
    <p className="wiki-token-guide">Claude Desktop, VS Code, Cursor and troubleshooting, in a new tab so this token stays on screen: <GuideLink newTab /></p>
    <button type="button" className="docs-primary" onClick={onDone}><DocIcon name="check" />Done, I have copied it</button>
  </section>;
}

function CreateForm({ wikis, busy, run, onCreated }: { wikis: Wiki[]; busy: boolean; run: Run; onCreated: (c: Created) => void }) {
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<WikiTokenPermission[]>([]);
  const [expiry, setExpiry] = useState('');
  const [sending, setSending] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSending(true);
    const created = await run(() => wikiCall<Created>('/api/wiki-tokens', 'POST', { label, wikiIds: chosen, permissions, expiresAt: endOfDay(expiry) }), 'Token created.');
    setSending(false);
    if (created) { onCreated(created); setLabel(''); setChosen([]); setPermissions([]); setExpiry(''); }
  }
  return <form className="docs-create wiki-token-create" onSubmit={(e) => void create(e)} aria-labelledby="wiki-token-new-head">
    <h2 id="wiki-token-new-head">New token</h2>
    <div className="docs-form-fields">
      <label>Label<input value={label} required maxLength={100} disabled={busy} placeholder="e.g. Work laptop" onChange={(e) => setLabel(e.target.value)} /></label>
      <label>Expires <span className="docs-muted">(optional)</span><input type="date" value={expiry} disabled={busy} onChange={(e) => setExpiry(e.target.value)} /></label>
    </div>
    <PermissionChoices chosen={permissions} onChange={setPermissions} disabled={busy} />
    <WikiChoices wikis={wikis} chosen={chosen} onChange={setChosen} disabled={busy} legend="Wikis this token can access" />
    <p className="docs-muted">Select the wikis this token can access. Writing also requires the relevant permission and your current wiki access.</p>
    <div className="docs-actions"><button type="submit" className="docs-primary" disabled={busy || !label.trim()} aria-busy={sending}><DocIcon name="plus" />Create token</button></div>
  </form>;
}

function EditForm({ token, wikis, busy, run, onClose }: { token: TokenRow; wikis: Wiki[]; busy: boolean; run: Run; onClose: () => void }) {
  const [label, setLabel] = useState(token.label);
  const [chosen, setChosen] = useState(token.wikis.map((w) => w.id));
  const [permissions, setPermissions] = useState<WikiTokenPermission[]>(token.permissions);
  const [sending, setSending] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSending(true);
    const saved = await run(() => wikiCall(`/api/wiki-tokens/${token.id}`, 'PATCH', { label, wikiIds: chosen, permissions }), 'Token saved.');
    setSending(false);
    if (saved) onClose();
  }
  return <form className="wiki-token-edit" onSubmit={(e) => void save(e)} aria-label={`Edit ${token.label}`}>
    <label>Label<input value={label} required maxLength={100} disabled={busy} onChange={(e) => setLabel(e.target.value)} /></label>
    <PermissionChoices chosen={permissions} onChange={setPermissions} disabled={busy} />
    <WikiChoices wikis={wikis} chosen={chosen} onChange={setChosen} disabled={busy} legend="Wikis this token can access" />
    <div className="docs-actions">
      <button type="submit" className="docs-primary" disabled={busy || !label.trim()} aria-busy={sending}><DocIcon name="save" />Save</button>
      <button type="button" disabled={busy} onClick={onClose}><DocIcon name="close" />Cancel</button>
    </div>
  </form>;
}

/** Revoking cannot be undone, so it asks first, in the one delete dialog. */
function RevokeButton({ token, busy, run }: { token: TokenRow; busy: boolean; run: Run }) {
  const [confirming, setConfirming] = useState(false);
  if (token.status === 'revoked') return null;
  return <>
    <button type="button" className="delete-control icon-only" aria-label={`Delete token ${token.label}`} title="Delete token" disabled={busy} onClick={() => setConfirming(true)}><TrashIcon /></button>
    {confirming && <ConfirmDelete title="Delete token" name={token.label}
      note="This cannot be undone. Any client using it stops working now." onCancel={() => setConfirming(false)}
      onConfirm={async () => { await run(() => wikiCall(`/api/wiki-tokens/${token.id}`, 'DELETE'), 'Token revoked. It stops working now.'); setConfirming(false); }}>
      <p>{prefixOf(token)}</p>
    </ConfirmDelete>}
  </>;
}

const prefixOf = (t: TokenRow) => `pmw_${t.prefix}…`;
const wikiList = (t: TokenRow) => (t.wikis.length ? t.wikis.map((w) => w.title).join(', ') : 'None');

function MyTokens({ tokens, wikis, busy, run }: { tokens: TokenRow[]; wikis: Wiki[]; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState<string | null>(null);
  const edited = tokens.find((t) => t.id === editing && t.status !== 'revoked');
  if (!tokens.length) return <p className="docs-muted">You have no tokens yet.</p>;
  return <>
    <div className="docs-table-wrap"><table className="docs-table wiki-tokens">
      <caption className="docs-sr-only">Your tokens</caption>
      <thead><tr>
        <th scope="col">Label</th><th scope="col">Token</th><th scope="col">Permissions</th><th scope="col">Wikis</th><th scope="col">Created</th>
        <th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span className="docs-sr-only">Actions</span></th>
      </tr></thead>
      <tbody>{tokens.map((t) => <tr key={t.id} className={t.status === 'active' ? undefined : 'wiki-token-dead'}>
        <th scope="row">{t.label}</th>
        <td><code>{prefixOf(t)}</code></td>
        <td>{permissionSummary(t)}</td>
        <td>{wikiList(t)}</td>
        <td><time dateTime={t.createdAt}>{stamp(t.createdAt)}</time></td>
        <td>{t.lastUsedAt ? <time dateTime={t.lastUsedAt}>{stamp(t.lastUsedAt)}</time> : 'Never'}</td>
        <td>{STATUS[t.status]}{t.status === 'active' && t.expiresAt && <span className="wiki-row-description">until {stamp(t.expiresAt)}</span>}</td>
        <td><div className="wiki-token-actions">
          {t.status !== 'revoked' && <button type="button" disabled={busy} onClick={() => setEditing(t.id)}><DocIcon name="edit" />Edit</button>}
          <RevokeButton token={t} busy={busy} run={run} />
        </div></td>
      </tr>)}</tbody>
    </table></div>
    {edited && <EditForm key={edited.id} token={edited} wikis={wikis} busy={busy} run={run} onClose={() => setEditing(null)} />}
  </>;
}

/** The install admin's view of every token (spec §6c). Secrets and hashes are never part of it. */
function AllTokens({ tokens, busy, run }: { tokens: TokenRow[]; busy: boolean; run: Run }) {
  return <section aria-labelledby="wiki-tokens-all-head">
    <h2 id="wiki-tokens-all-head" className="wiki-section-head">All tokens</h2>
    <p className="docs-muted">Every token in this install. You can revoke any of them; you cannot see or recover a secret.</p>
    {tokens.length ? <div className="docs-table-wrap"><table className="docs-table wiki-tokens">
      <caption className="docs-sr-only">All tokens</caption>
      <thead><tr>
        <th scope="col">Label</th><th scope="col">Token</th><th scope="col">Created by</th><th scope="col">Permissions</th><th scope="col">Wikis</th>
        <th scope="col">Created</th><th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span className="docs-sr-only">Revoke</span></th>
      </tr></thead>
      <tbody>{tokens.map((t) => <tr key={t.id} className={t.status === 'active' ? undefined : 'wiki-token-dead'}>
        <th scope="row">{t.label}</th>
        <td><code>{prefixOf(t)}</code></td>
        <td>{t.ownerName}<span className="wiki-row-description">{t.ownerEmail}</span></td>
        <td>{permissionSummary(t)}</td>
        <td>{wikiList(t)}</td>
        <td><time dateTime={t.createdAt}>{stamp(t.createdAt)}</time></td>
        <td>{t.lastUsedAt ? <time dateTime={t.lastUsedAt}>{stamp(t.lastUsedAt)}</time> : 'Never'}</td>
        <td>{STATUS[t.status]}</td>
        <td><RevokeButton token={t} busy={busy} run={run} /></td>
      </tr>)}</tbody>
    </table></div> : <p className="docs-muted">Nobody has made a token yet.</p>}
  </section>;
}

export default function TokensView({ origin, wikis, mine, all }: { origin: string; wikis: Wiki[]; mine: TokenRow[]; all: TokenRow[] | null }) {
  const { busy, notice, error, run } = useRunner();
  const [created, setCreated] = useState<Created | null>(null);
  return <div className="wiki-tokens-view">
    <p className="docs-notice" role="status">{notice}</p>
    {error && <p className="docs-error" role="alert">{error}</p>}
    {created
      ? <SecretPanel created={created} origin={origin} onDone={() => setCreated(null)} />
      : <CreateForm wikis={wikis} busy={busy} run={run} onCreated={setCreated} />}
    <h2 className="wiki-section-head">Your tokens</h2>
    <MyTokens tokens={mine} wikis={wikis} busy={busy} run={run} />
    {all && <AllTokens tokens={all} busy={busy} run={run} />}
  </div>;
}
