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
import { contentMarkdown } from './doc-rich-content.ts';

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

/**
 * Deleting a wiki — pages, history, files, members, link and token scopes, for
 * good — is the install admin's alone (D-82). The owner can archive, which
 * anyone with the right can undo; deletion cannot be undone, so it is not a
 * right that comes with ownership.
 */
export function canDeleteWiki(v: WikiViewer, w: WikiFacts): boolean {
  return wikiRole(v, w) === 'install';
}

/**
 * What the screens may draw for a role a wiki already granted, so a page
 * never offers a control its routes would refuse. The same answers as
 * `canWriteWiki` / `canManageWiki` / `canDeleteWiki`, read from the role
 * `wikiRole` returned.
 */
export function wikiAbilities(role: WikiRole, archived: boolean): { canWrite: boolean; canManage: boolean; canDelete: boolean } {
  const canManage = role === 'install' || role === 'owner';
  return { canWrite: !archived && (canManage || role === 'write'), canManage, canDelete: role === 'install' };
}

/* -------------------------------------------------------------- creating */

// Matches the DB's own checks (db/migrations/021_wiki.sql): `wiki_title`
// CHECK (char_length(btrim(...)) BETWEEN 1 AND 200), `wiki_description`
// CHECK (char_length(...) <= 1000). Kept here too so a bad value never
// reaches the database to be rejected there instead.
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

function parseTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  if (!title) throw domainError('E_INVALID_DOC', 'A wiki needs a title.');
  if (title.length > MAX_TITLE_LENGTH) {
    throw domainError('E_INVALID_DOC', 'That title is too long.', { title });
  }
  return title;
}

function parseDescription(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') {
    throw domainError('E_INVALID_DOC', 'That is not a description.', { description: raw });
  }
  const description = raw.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw domainError('E_INVALID_DOC', 'That description is too long.', { description });
  }
  return description;
}

export function parseNewWiki(input: unknown): { title: string; description: string } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const title = parseTitle(obj.title);
  return { title, description: parseDescription(obj.description) };
}

/* -------------------------------------------------------------- updating */

export type WikiUpdate =
  | { action: 'rename'; title: string }
  | { action: 'describe'; description: string }
  | { action: 'archive' }
  | { action: 'restore' }
  | { action: 'transfer'; userId: string }
  | { action: 'publish' }
  | { action: 'unpublish' };

/**
 * One change to a wiki's settings, all of which need `canManageWiki`. The
 * same title and description limits as creating one.
 */
export function parseWikiUpdate(input: unknown): WikiUpdate {
  const obj = (input ?? {}) as Record<string, unknown>;
  switch (obj.action) {
    case 'rename': return { action: 'rename', title: parseTitle(obj.title) };
    case 'describe': return { action: 'describe', description: parseDescription(obj.description) };
    case 'archive': return { action: 'archive' };
    case 'restore': return { action: 'restore' };
    case 'transfer': return { action: 'transfer', userId: parseMemberRef(obj).userId };
    case 'publish': return { action: 'publish' };
    case 'unpublish': return { action: 'unpublish' };
    default:
      throw domainError('E_INVALID_DOC', 'Unknown wiki action.', { action: obj.action });
  }
}

/* ---------------------------------------------------------------- members */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an id from a URL could name a row at all — a malformed one is a 404, never a 500. */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

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

/** The `{ userId }` naming a member to remove, or a new owner. */
export function parseMemberRef(input: unknown): { userId: string } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const userId = typeof obj.userId === 'string' ? obj.userId : '';
  if (!UUID_RE.test(userId)) {
    throw domainError('E_INVALID_DOC', 'That is not a user.', { userId: obj.userId });
  }
  return { userId };
}

/**
 * The owner already holds every right a member row could give, so a row
 * for them would only be a second, contradictory answer to "what may they
 * do" — refused rather than stored. Transferring to the current owner is
 * refused for the same reason: it would demote them to a member of their
 * own wiki.
 */
export function assertNotOwner(targetUserId: string, ownerId: string | null): void {
  if (ownerId !== null && targetUserId === ownerId) {
    throw domainError('E_INVALID_DOC', 'That person already owns this wiki.');
  }
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

export type TokenStatus = 'active' | 'revoked' | 'expired';

/** Revoked outranks expired: revoking is the act a person took, expiry is the calendar's. */
export function tokenStatus(t: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): TokenStatus {
  if (t.revokedAt !== null) return 'revoked';
  if (t.expiresAt !== null && t.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/** `wiki_token_last_used_at` is written at most once a minute per token. */
export const LAST_USED_GRANULARITY_MS = 60_000;

export function shouldTouchLastUsed(lastUsedAt: Date | null, now: Date): boolean {
  return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS;
}

/**
 * The body of "Allow my token" — `{ tokenIds: string[] }`. A malformed id is
 * refused like a token that is not the caller's, with `E_NOT_FOUND`, so the
 * two cannot be told apart.
 */
export function parseTokenIds(input: unknown): string[] {
  const raw = (input as { tokenIds?: unknown } | null)?.tokenIds;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
    throw domainError('E_INVALID_DOC', 'Send the tokens to allow as { tokenIds: [...] }.');
  }
  const ids = [...new Set(raw as string[])];
  if (ids.some((id) => !UUID_RE.test(id))) throw domainError('E_NOT_FOUND', 'No such token.');
  return ids;
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
  const end = Math.min(text.length, start + width);
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

/* ------------------------------------------------------------------ pages */

/** Optional page id in a request body: blank is "none", malformed is refused. */
function optionalPageId(value: unknown, message: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isUuid(value)) throw domainError('E_INVALID_DOC', message);
  return value.toLowerCase();
}

export function parsePageTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw domainError('E_INVALID_DOC', 'Use a page title between 1 and 200 characters.');
  }
  return value.trim();
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Addresses under `/wiki/<id>/` that belong to a screen, not a page. */
const RESERVED_PAGE_SLUGS = new Set(['settings']);

/**
 * A slug chosen at creation (D-62 carried over): lowercase letters, digits
 * and single hyphens, at most 80 characters. Blank means "generate one" and
 * is returned as null — a Thai title is never romanised into a slug.
 */
export function parsePageSlug(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw domainError('E_INVALID_DOC', 'Use letters, digits and hyphens for the address.');
  const slug = value.trim().toLowerCase();
  if (!slug) return null;
  if (slug.length > 80 || !SLUG_RE.test(slug)) {
    throw domainError('E_INVALID_DOC', 'Use up to 80 lowercase letters, digits and single hyphens for the address.');
  }
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    throw domainError('E_INVALID_DOC', `“${slug}” is taken by the wiki itself. Choose another address.`);
  }
  return slug;
}

/** The address given to a page created with a blank slug: `page-` and 8 hex. */
export function generatedPageSlug(): string {
  return 'page-' + randomBytes(4).toString('hex');
}

export type NewWikiPage = { title: string; slug: string | null; parentId: string | null; body: unknown };

/** `{ title, slug?, parentId?, body? }`. The body itself is checked by `parsePageContent`. */
export function parseNewWikiPage(input: unknown): NewWikiPage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw domainError('E_INVALID_DOC', 'Enter a page title.');
  const o = input as Record<string, unknown>;
  return {
    title: parsePageTitle(o.title),
    slug: parsePageSlug(o.slug),
    parentId: optionalPageId(o.parentId, 'Choose a parent page in this wiki.'),
    body: o.body,
  };
}

/** `{ parentId, beforeId? }` — a null or absent parent moves the page to the top level. */
export function parsePageMove(input: unknown): { parentId: string | null; beforeId: string | null } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw domainError('E_INVALID_DOC', 'Choose where to move the page.');
  const o = input as Record<string, unknown>;
  return {
    parentId: optionalPageId(o.parentId, 'Choose a parent page in this wiki.'),
    beforeId: optionalPageId(o.beforeId, 'Choose a sibling page to move before.'),
  };
}

/** One Markdown line with its syntax removed, keeping the words a person would search for. */
function stripMarkdownLine(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^(\s*>\s?)+/, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/, '')
    .replace(/!\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, '$1')
    .replace(/(?<!\\)\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, '$1')
    .replace(/(\\)?(\*\*|~~|[*`|])/g, (all, escaped: string | undefined) => (escaped ? all : ' '))
    .replace(/\\([\\`*_[\]<>|~])/g, '$1');
}

/**
 * The text written to `wiki_page_search_text` on every save (spec §4b): the
 * title, then the body as `contentMarkdown` renders it with the Markdown
 * syntax stripped. Code blocks — Mermaid among them — are kept verbatim, so
 * a diagram's labels are searchable. Rich JSON keys never reach the index:
 * the body is rendered, not stringified.
 */
export function pageSearchText(title: string, body: string): string {
  const out: string[] = [title];
  let fence: string | null = null;
  for (const line of contentMarkdown(body).split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker.startsWith(fence) && line.trim() === marker) fence = null;
      else out.push(line);
      continue;
    }
    if (marker) { fence = marker; continue; }
    out.push(stripMarkdownLine(line));
  }
  return out.map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/* ------------------------------------------------------------- breadcrumb */

/**
 * The titles above a page, top first, not including the page itself — the
 * `breadcrumb` the MCP `read_page` tool returns (spec §7). A parent missing
 * from `pages` ends the trail, and a page seen twice stops it, so a damaged
 * tree can never loop.
 */
export function pageBreadcrumb(
  pages: ReadonlyArray<{ id: string; parentId: string | null; title: string }>,
  pageId: string,
): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set([pageId]);
  const trail: string[] = [];
  let parentId = byId.get(pageId)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    trail.push(parent.title);
    parentId = parent.parentId;
  }
  return trail.reverse();
}
