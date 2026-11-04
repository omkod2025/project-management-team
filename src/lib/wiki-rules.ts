/**
 * Wiki rules, as pure functions.
 *
 * Same split as `node-rules.ts` / `admin-rules.ts`: these are decisions — who
 * sees a wiki, who may write it, what a token may read, what a search term
 * means at the database boundary — so they live where a test can reach them
 * without a database. `wiki.ts` and `wiki-tokens.ts` are the adapters that
 * load a row, call these, and write the result back.
 *
 * The rule everything else is computed from (spec §5c):
 *
 * > A wiki is visible to a user when they are the install admin, its owner,
 * > or a member, and it is not archived (archived wikis are visible only to
 * > the owner and install admin).
 */

import { createHash, randomBytes } from 'node:crypto';

import { domainError } from './errors.ts';
import { PROTECTED_EMAIL } from './admin-rules.ts';

/* -------------------------------------------------------------- identity */

export type WikiAccess = 'read' | 'write';
export type WikiViewer = { userId: string; email: string; active: boolean };
export type WikiFacts = { ownerId: string | null; archived: boolean; memberAccess: WikiAccess | null };
export type WikiRole = 'install' | 'owner' | 'write' | 'read';

/**
 * The install administrator, the one global role (spec §5a).
 *
 * Compared case-insensitively and trimmed, the same way `canDeleteUsers`
 * does, because this address is typed by hand in the same places that one
 * is.
 */
export function isInstallAdmin(v: WikiViewer): boolean {
  return v.active && v.email.trim().toLowerCase() === PROTECTED_EMAIL;
}

/**
 * A viewer's standing on a wiki, or `null` when they have none at all —
 * either because they are inactive, or because they are a stranger to a
 * wiki that gives them no membership.
 *
 * The install admin wins over every other standing (spec §5a): even an
 * owner or member account that happens to be the install admin is reported
 * as `'install'`, because that is the role whose rights apply.
 */
export function wikiRole(v: WikiViewer, w: WikiFacts): WikiRole | null {
  if (!v.active) return null;
  if (isInstallAdmin(v)) return 'install';
  if (w.ownerId !== null && w.ownerId === v.userId) return 'owner';
  if (w.memberAccess === 'write') return 'write';
  if (w.memberAccess === 'read') return 'read';
  return null;
}

/** Archived → owner and install admin only. Otherwise, any standing at all. */
export function canSeeWiki(v: WikiViewer, w: WikiFacts): boolean {
  const role = wikiRole(v, w);
  if (role === null) return false;
  if (w.archived) return role === 'install' || role === 'owner';
  return true;
}

/** Never on an archived wiki, for anyone — install admin and owner included. */
export function canWriteWiki(v: WikiViewer, w: WikiFacts): boolean {
  if (w.archived) return false;
  const role = wikiRole(v, w);
  return role === 'install' || role === 'owner' || role === 'write';
}

/** Structure and settings: install admin or owner, archived or not. */
export function canManageWiki(v: WikiViewer, w: WikiFacts): boolean {
  const role = wikiRole(v, w);
  return role === 'install' || role === 'owner';
}

/* -------------------------------------------------------------- creating */

// Matches the DB's own checks (db/migrations/021_wiki.sql): `wiki_title`
// CHECK (char_length(btrim(...)) BETWEEN 1 AND 200), `wiki_description`
// CHECK (char_length(...) <= 1000). Kept here too so a bad value never
// reaches the database to be rejected there instead.
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

export function parseNewWiki(input: unknown): { title: string; description: string } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) throw domainError('E_INVALID_DOC', 'A wiki needs a title.');
  if (title.length > MAX_TITLE_LENGTH) {
    throw domainError('E_INVALID_DOC', 'That title is too long.', { title });
  }

  let description = '';
  if (obj.description !== undefined && obj.description !== null) {
    if (typeof obj.description !== 'string') {
      throw domainError('E_INVALID_DOC', 'That is not a description.', { description: obj.description });
    }
    description = obj.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw domainError('E_INVALID_DOC', 'That description is too long.', { description });
    }
  }

  return { title, description };
}

/* ---------------------------------------------------------------- members */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMemberGrant(input: unknown): { userId: string; access: WikiAccess } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const userId = typeof obj.userId === 'string' ? obj.userId : '';
  if (!UUID_RE.test(userId)) {
    throw domainError('E_INVALID_DOC', 'That is not a user.', { userId: obj.userId });
  }
  const access = obj.access;
  if (access !== 'read' && access !== 'write') {
    throw domainError('E_INVALID_DOC', 'Access must be read or write.', { access });
  }
  return { userId, access };
}

/* ----------------------------------------------------------------- tokens */

/** `wiki_token_prefix` is the first 8 characters of the secret after `pmw_`. */
export const TOKEN_PREFIX = 'pmw_';

/** One user's standing limit on live tokens (spec §6a, the builder's call). */
export const MAX_ACTIVE_TOKENS = 20;

/**
 * A fresh token: 32 random bytes as base64url, prefixed, hashed for storage,
 * and a short prefix kept in the clear for display. Only `secret` is ever
 * shown to the person who created it.
 */
export function newTokenSecret(): { secret: string; hash: string; prefix: string } {
  const secret = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { secret, hash: hashTokenSecret(secret), prefix: secret.slice(4, 12) };
}

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

const BEARER_RE = /^Bearer (pmw_[A-Za-z0-9_-]{43})$/;

/** The secret out of an `Authorization` header, or `null` if it is not one of ours. */
export function bearerSecret(header: string | null): string | null {
  if (header === null) return null;
  const match = BEARER_RE.exec(header);
  return match?.[1] ?? null;
}

export type TokenFacts = { revokedAt: Date | null; expiresAt: Date | null; ownerActive: boolean };

/**
 * What a token may read right now (spec §6b):
 *
 * > effective wikis = token scopes ∩ wikis the token's owner can see right
 * > now
 *
 * — and nothing at all if the token is revoked, expired, or its owner is
 * inactive. Scope rows are never consulted for existence on their own; they
 * only ever narrow what is already visible, so losing and regaining
 * membership take effect immediately with nothing to clean up.
 */
export function effectiveTokenWikis(
  t: TokenFacts,
  scopes: readonly string[],
  visible: ReadonlySet<string>,
  now: Date,
): string[] {
  if (t.revokedAt !== null) return [];
  if (t.expiresAt !== null && t.expiresAt.getTime() <= now.getTime()) return [];
  if (!t.ownerActive) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of scopes) {
    if (visible.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

const MAX_LABEL_LENGTH = 100;

/**
 * A token being created or edited.
 *
 * A wiki id that is not uuid-shaped and one that is simply not visible to
 * the caller are refused identically, with `E_NOT_FOUND` — the same
 * existence-leak rule as everywhere else in the product (spec §8): telling
 * the two apart would tell a caller whether a wiki they cannot see exists at
 * all.
 */
export function parseTokenInput(
  input: unknown,
  visible: ReadonlySet<string>,
): { label: string; wikiIds: string[]; expiresAt: Date | null } {
  const obj = (input ?? {}) as Record<string, unknown>;

  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  if (!label) throw domainError('E_INVALID_DOC', 'A token needs a label.');
  if (label.length > MAX_LABEL_LENGTH) {
    throw domainError('E_INVALID_DOC', 'That label is too long.', { label });
  }

  const rawIds = Array.isArray(obj.wikiIds) ? obj.wikiIds : [];
  const seen = new Set<string>();
  const wikiIds: string[] = [];
  for (const raw of rawIds) {
    const id = typeof raw === 'string' ? raw : '';
    if (!UUID_RE.test(id) || !visible.has(id)) {
      throw domainError('E_NOT_FOUND', 'That wiki does not exist.');
    }
    if (!seen.has(id)) {
      seen.add(id);
      wikiIds.push(id);
    }
  }

  let expiresAt: Date | null = null;
  if (obj.expiresAt !== null && obj.expiresAt !== undefined) {
    if (typeof obj.expiresAt !== 'string') {
      throw domainError('E_INVALID_DOC', 'That is not a date.', { expiresAt: obj.expiresAt });
    }
    const parsed = new Date(obj.expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw domainError('E_INVALID_DOC', 'The expiry date must be in the future.', { expiresAt: obj.expiresAt });
    }
    expiresAt = parsed;
  }

  return { label, wikiIds, expiresAt };
}

/* ----------------------------------------------------------------- search */

const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 100;

/**
 * A search query split into the terms `likePattern` will bind, one per
 * whitespace-separated word: trimmed, deduped in order, capped at eight
 * terms of a hundred characters each. Thai has no spaces inside a word, so
 * this never splits a single Thai word apart — only the spaces a person
 * typed between words.
 */
export function searchTerms(q: unknown): string[] {
  if (typeof q !== 'string') return [];
  const trimmed = q.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of trimmed.split(/\s+/)) {
    const term = word.slice(0, MAX_TERM_LENGTH);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/**
 * A term as an `ILIKE` wildcard pattern, with `\`, `%` and `_` escaped in
 * the value so a term containing them matches literally. The pattern is
 * still bound as a parameter (spec §8) — this only stops the term's own
 * characters from acting as wildcards, it is not an SQL escape.
 */
export function likePattern(term: string): string {
  return '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
}

/**
 * About `width` characters of `text`, centred on the first term it
 * contains, with `…` on whichever side(s) were cut.
 */
export function searchSnippet(text: string, terms: readonly string[], width = 200): string {
  const lower = text.toLowerCase();
  let matchIndex = -1;
  for (const term of terms) {
    if (!term) continue;
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) matchIndex = idx;
  }

  const center = matchIndex === -1 ? 0 : matchIndex;
  let start = Math.max(0, center - Math.floor(width / 2));
  let end = Math.min(text.length, start + width);
  start = Math.max(0, end - width);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}

/* ------------------------------------------------------------- rate limit */

/**
 * The MCP endpoint's in-memory limiter (spec §8): a sliding window of up to
 * `limit` hits per `windowMs`, per token. The caller owns the array between
 * calls — this function only decides and returns the next one, so it stays
 * pure and testable without a clock to fake.
 */
export function takeRateSlot(
  hits: number[],
  now: number,
  limit = 60,
  windowMs = 60_000,
): { allowed: boolean; hits: number[] } {
  const cutoff = now - windowMs;
  const recent = hits.filter((h) => h > cutoff);
  if (recent.length >= limit) {
    return { allowed: false, hits: recent };
  }
  recent.push(now);
  return { allowed: true, hits: recent };
}

/* ------------------------------------------------------------ public link */

/** The whole guard on `/w/<token>` (spec §5b) — 32 random bytes, base64url. */
export function publicWikiToken(): string {
  return randomBytes(32).toString('base64url');
}
