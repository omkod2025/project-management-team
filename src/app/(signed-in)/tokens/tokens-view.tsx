'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TokenRow } from '@/lib/access-tokens';
import { TOKEN_MODULES } from '@/lib/token-modules';
import { DataTable } from '@/components/data-table';
import ConfirmDelete, { TrashIcon } from '../confirm-delete';
import GuideLink from './guide-link';
import { deleteToken } from './token-api';

const day = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
const stamp = (iso: string | null) => (iso ? day.format(new Date(iso)) : 'Never');
const STATUS: Record<TokenRow['status'], string> = { active: 'Active', revoked: 'Revoked', expired: 'Expired' };
const prefixOf = (t: TokenRow) => `pmw_${t.prefix}…`;

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

function TokenTable({ caption, tokens, owners, busy, editable, onRevoke }: {
  caption: string; tokens: TokenRow[]; owners: boolean; busy: boolean;
  editable?: boolean; onRevoke: (t: TokenRow) => Promise<void>;
}) {
  return <DataTable caption={caption} className="tk-table">
    <thead><tr>
      <th scope="col">Label</th>
      <th scope="col">Access</th><th scope="col">Where</th>{owners && <th scope="col">Created by</th>}<th scope="col">Created</th>
      <th scope="col">Expired</th><th scope="col">Last used</th><th scope="col">Status</th><th scope="col"><span className="tk-sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{tokens.map((t) => <tr key={t.id} className={t.status === 'active' ? undefined : 'tk-dead'}>
      <th scope="row">{t.label}</th>
      <td data-label="Access"><Access token={t} /></td>
      <td data-label="Where"><Where token={t} /></td>
      {owners && <td data-label="Created by">{t.ownerName}<span className="tk-sub">{t.ownerEmail}</span></td>}
      <td data-label="Created"><time dateTime={t.createdAt}>{stamp(t.createdAt)}</time></td>
      <td data-label="Expired">{t.expiresAt ? <time dateTime={t.expiresAt}>{stamp(t.expiresAt)}</time> : 'Never'}</td>
      <td data-label="Last used">{t.lastUsedAt ? <time dateTime={t.lastUsedAt}>{stamp(t.lastUsedAt)}</time> : 'Never'}</td>
      <td data-label="Status">{STATUS[t.status]}</td>
      <td className="tk-actions-cell"><div className="tk-actions">
        {editable && t.status !== 'revoked' && <Link className="tk-btn" href={`/tokens/${t.id}/edit`}>Edit</Link>}
        <RevokeButton token={t} busy={busy} onRevoke={onRevoke} />
      </div></td>
    </tr>)}</tbody>
  </DataTable>;
}

/**
 * Tokens / MCP: the tokens you have, and for the install admin every token
 * in the install, deletable but never readable. Making and editing a token
 * happen on pages of their own (`/tokens/new`, `/tokens/<id>/edit`).
 */
export default function TokensView({ mine, all }: { mine: TokenRow[]; all: TokenRow[] | null }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState('');

  /** A refusal throws through to ConfirmDelete, which shows it in place inside its own dialog. */
  async function revoke(t: TokenRow) {
    await deleteToken(t.id);
    setNotice('Token deleted. It stops working now.');
    startRefresh(() => router.refresh());
  }

  return <div className="tk-body data-page">
    <div className="tk-intro">
      <p>A token lets an AI assistant work in List, Docs and the Wiki over MCP. Choose what it can do and where; it never does more than you can.</p>
      <div className="tk-intro-actions">
        <GuideLink />
        <Link className="tk-primary tk-make" href="/tokens/new">Make a token</Link>
      </div>
    </div>

    <p className="tk-notice" role="status">{notice}</p>

    <section aria-labelledby="tk-mine-head">
      <h2 id="tk-mine-head" className="tk-section-head">Your tokens</h2>
      {mine.length
        ? <TokenTable caption="Your tokens" tokens={mine} owners={false} busy={refreshing} editable onRevoke={revoke} />
        : <p className="tk-empty">You have no tokens yet. Make one to connect an AI assistant.</p>}
    </section>

    {all && <section aria-labelledby="tk-all-head">
      <h2 id="tk-all-head" className="tk-section-head">All tokens</h2>
      <p className="tk-muted">Every token in this install. You can delete any of them; you cannot see or recover a secret.</p>
      {all.length
        ? <TokenTable caption="All tokens" tokens={all} owners busy={refreshing} onRevoke={revoke} />
        : <p className="tk-empty">Nobody has made a token yet.</p>}
    </section>}
  </div>;
}
