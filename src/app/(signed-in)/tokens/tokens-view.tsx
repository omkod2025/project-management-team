'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TokenRow } from '@/lib/access-tokens';
import type { VisibleProject } from '@/lib/project-access';
import type { WikiRole } from '@/lib/wiki-rules';
import { TOKEN_MODULES } from '@/lib/token-modules';
import ConfirmDelete, { TrashIcon } from '../confirm-delete';
import TokenStepper from './token-stepper';
import { revokeToken, type CreatedToken } from './token-api';

type Wiki = { id: string; title: string; role: WikiRole };
type Open = { kind: 'create' } | { kind: 'edit'; token: TokenRow } | null;

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
const stamp = (iso: string | null) => (iso ? day.format(new Date(iso)) : 'Never');
const STATUS: Record<TokenRow['status'], string> = { active: 'Active', revoked: 'Revoked', expired: 'Expired' };
const prefixOf = (t: TokenRow) => `pmw_${t.prefix}…`;

function mcpConfig(origin: string, secret: string): string {
  return JSON.stringify({
    mcpServers: { 't-timeline': { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${secret}` } } },
  }, null, 2);
}

const mcpCommand = (origin: string, secret: string) =>
  `claude mcp add --transport http t-timeline ${origin}/api/mcp --header "Authorization: Bearer ${secret}"`;

/** The connection guide, in Thai. Beside a secret it opens in a new tab, because leaving this page loses the secret. */
export function GuideLink({ newTab = false }: { newTab?: boolean }) {
  return <Link className="tk-btn tk-guide-link" href="/tokens/guide"
    {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>How to connect</Link>;
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState('');
  return <div className="tk-snippet">
    <div className="tk-snippet-head">
      <span>{label}</span>
      <button type="button" className="tk-btn" onClick={() => {
        void navigator.clipboard.writeText(text)
          .then(() => setState('Copied.'))
          .catch(() => setState('Could not copy. Select the text and copy it.'));
      }}>Copy</button>
    </div>
    <pre><code>{text}</code></pre>
    <p className="tk-copied" role="status">{state}</p>
  </div>;
}

/** Shown once, straight after creation. Leaving or pressing Done loses it for good. */
function SecretPanel({ created, origin, onDone }: { created: CreatedToken; origin: string; onDone: () => void }) {
  return <section className="tk-panel tk-secret" aria-labelledby="tk-secret-head">
    <h2 id="tk-secret-head">Copy your token now</h2>
    <p>This is the only time “{created.token.label}” is shown in full. It is not stored and cannot be shown again.</p>
    <CopyBlock label="Token" text={created.secret} />
    <CopyBlock label="MCP client config (JSON)" text={mcpConfig(origin, created.secret)} />
    <CopyBlock label="Claude Code" text={mcpCommand(origin, created.secret)} />
    <p className="tk-guide-line">Claude Desktop, VS Code, Cursor and troubleshooting, in a new tab so this token stays on screen: <GuideLink newTab /></p>
    <div className="tk-foot"><span /><button type="button" className="tk-primary" onClick={onDone}>Done, I have copied it</button></div>
  </section>;
}

/** One line per module the token reaches: its name, then Read and whatever it may create or write. */
function Access({ token }: { token: TokenRow }) {
  const mods = TOKEN_MODULES.filter((m) => Object.hasOwn(token.grants, m.key));
  if (!mods.length) return <span className="tk-muted">Nothing</span>;
  return <ul className="tk-cell-list">{mods.map((m) => {
    const extra = m.permissions.filter((p) => token.grants[m.key]!.includes(p.key)).map((p) => p.label);
    return <li key={m.key}><span className="tk-cell-mod">{m.label}</span> {extra.length ? extra.join(', ') : 'Read only'}</li>;
  })}</ul>;
}

function Where({ token }: { token: TokenRow }) {
  const places = [...token.projects.map((p) => ({ id: p.id, name: p.name })), ...token.wikis.map((w) => ({ id: w.id, name: w.title }))];
  if (!places.length) return <span className="tk-muted">Nowhere yet</span>;
  return <ul className="tk-cell-list">{places.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

/** Revoking cannot be undone, so it asks first, in the one delete dialog — danger red, never vermilion. */
function RevokeButton({ token, busy, onRevoke }: { token: TokenRow; busy: boolean; onRevoke: (t: TokenRow) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (token.status === 'revoked') return null;
  return <>
    <button type="button" className="delete-control icon-only" aria-label={`Delete token ${token.label}`} title="Delete token"
      disabled={busy} onClick={() => setConfirming(true)}><TrashIcon /></button>
    {confirming && <ConfirmDelete title="Delete token" name={token.label}
      note="This cannot be undone. Any client using it stops working now." onCancel={() => setConfirming(false)}
      onConfirm={async () => { await onRevoke(token); setConfirming(false); }}>
      <p>{prefixOf(token)}</p>
    </ConfirmDelete>}
  </>;
}

function TokenTable({ caption, tokens, owners, busy, onEdit, onRevoke }: {
  caption: string; tokens: TokenRow[]; owners: boolean; busy: boolean;
  onEdit?: (t: TokenRow) => void; onRevoke: (t: TokenRow) => Promise<void>;
}) {
  return <div className="tk-table-wrap"><table className="tk-table">
    <caption className="tk-sr-only">{caption}</caption>
    <thead><tr>
      <th scope="col">Label</th><th scope="col">Token</th>{owners && <th scope="col">Created by</th>}
      <th scope="col">Access</th><th scope="col">Where</th><th scope="col">Created</th>
      <th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span className="tk-sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{tokens.map((t) => <tr key={t.id} className={t.status === 'active' ? undefined : 'tk-dead'}>
      <th scope="row">{t.label}</th>
      <td data-label="Token"><code>{prefixOf(t)}</code></td>
      {owners && <td data-label="Created by">{t.ownerName}<span className="tk-sub">{t.ownerEmail}</span></td>}
      <td data-label="Access"><Access token={t} /></td>
      <td data-label="Where"><Where token={t} /></td>
      <td data-label="Created"><time dateTime={t.createdAt}>{stamp(t.createdAt)}</time></td>
      <td data-label="Last used">{t.lastUsedAt ? <time dateTime={t.lastUsedAt}>{stamp(t.lastUsedAt)}</time> : 'Never'}</td>
      <td data-label="Status">{STATUS[t.status]}{t.status === 'active' && t.expiresAt && <span className="tk-sub">until {stamp(t.expiresAt)}</span>}</td>
      <td className="tk-actions-cell"><div className="tk-actions">
        {onEdit && t.status !== 'revoked' && <button type="button" className="tk-btn" disabled={busy} onClick={() => onEdit(t)}>Edit</button>}
        <RevokeButton token={t} busy={busy} onRevoke={onRevoke} />
      </div></td>
    </tr>)}</tbody>
  </table></div>;
}

/**
 * Tokens / MCP: make a token in the stepper, see it once, and manage the
 * ones you have. The install admin also sees every token in the install and
 * may revoke any of them, never read a secret.
 */
export default function TokensView({ origin, projects, wikis, mine, all }: {
  origin: string; projects: VisibleProject[]; wikis: Wiki[]; mine: TokenRow[]; all: TokenRow[] | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [open, setOpen] = useState<Open>(null);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [notice, setNotice] = useState('');
  const refresh = () => startRefresh(() => router.refresh());

  function done(result?: CreatedToken) {
    const wasEditing = open?.kind === 'edit';
    setOpen(null);
    if (result) { setCreated(result); setNotice('Token created.'); refresh(); }
    else if (wasEditing) refresh();
  }

  /** A refusal throws through to ConfirmDelete, which shows it in place inside its own dialog. */
  async function revoke(t: TokenRow) {
    await revokeToken(t.id);
    setNotice('Token revoked. It stops working now.');
    refresh();
  }

  return <div className="tk-body">
    <div className="tk-intro">
      <p>A token lets an AI assistant work in List, Docs and the Wiki over MCP. Choose what it can do and where; it never does more than you can.</p>
      <div className="tk-intro-actions">
        <GuideLink />
        {!open && !created && <button type="button" className="tk-primary tk-make" onClick={() => { setNotice(''); setOpen({ kind: 'create' }); }}>Make a token</button>}
      </div>
    </div>

    <p className="tk-notice" role="status">{notice}</p>

    {created && <SecretPanel created={created} origin={origin} onDone={() => { setCreated(null); setNotice(''); }} />}
    {open && <section className="tk-panel" aria-label={open.kind === 'edit' ? 'Edit token' : 'Make a token'}>
      <TokenStepper key={open.kind === 'edit' ? open.token.id : 'new'} projects={projects} wikis={wikis}
        token={open.kind === 'edit' ? open.token : undefined} onDone={done} />
    </section>}

    <section aria-labelledby="tk-mine-head">
      <h2 id="tk-mine-head" className="tk-section-head">Your tokens</h2>
      {mine.length
        ? <TokenTable caption="Your tokens" tokens={mine} owners={false} busy={refreshing}
          onEdit={(t) => { setCreated(null); setNotice(''); setOpen({ kind: 'edit', token: t }); }} onRevoke={revoke} />
        : <p className="tk-empty">You have no tokens yet. Make one to connect an AI assistant.</p>}
    </section>

    {all && <section aria-labelledby="tk-all-head">
      <h2 id="tk-all-head" className="tk-section-head">All tokens</h2>
      <p className="tk-muted">Every token in this install. You can revoke any of them; you cannot see or recover a secret.</p>
      {all.length
        ? <TokenTable caption="All tokens" tokens={all} owners busy={refreshing} onRevoke={revoke} />
        : <p className="tk-empty">Nobody has made a token yet.</p>}
    </section>}
  </div>;
}
