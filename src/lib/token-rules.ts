/**
 * Token rules, as pure functions.
 *
 * Same split as `node-rules.ts` / `wiki-rules.ts`: these are decisions — what
 * a module declares, what a token may be granted, what it may currently
 * reach — so they live where a test can reach them without a database.
 * `wiki-tokens.ts` and the token adapters the rest of the central MCP tokens
 * work adds are the pieces that load a row, call these, and write the result
 * back.
 *
 * This module also carries the token/secret/status/rate-limiter helpers that
 * used to live in `wiki-rules.ts`, now that a token is a system-wide facility
 * rather than a wiki-only one (`docs/superpowers/specs/2026-11-09-central-mcp-tokens-design.md`).
 */

import { createHash, randomBytes } from 'node:crypto';

import { domainError } from './errors.ts';

/* -------------------------------------------------------- module registry */

export type ModuleKey = 'list' | 'docs' | 'wiki';

/** What a scope row inside a module's grant names: a project, or a module-owned item such as a wiki. */
export type ScopeKind = 'project' | 'wiki';

export type TokenPermission = { key: string; label: string; hint: string };

export type TokenModule = {
  key: ModuleKey;
  label: string;
  hint: string;
  scope: ScopeKind;
  permissions: readonly TokenPermission[];
};

/**
 * The declaration every other piece of the central MCP tokens work reads:
 * the stepper, grant validation, storage and MCP tool registration (design
 * doc, "Extensible by declaration"). Adding a module means adding one entry
 * here and its tools, not a migration that adds columns.
 *
 * Read is not listed as a permission — choosing a module grants it, and it
 * can never be revoked on its own (`hasModule`).
 */
export const TOKEN_MODULES: readonly TokenModule[] = [
  {
    key: 'list',
    label: 'List',
    hint: 'Always on: read tasks.',
    scope: 'project',
    permissions: [
      { key: 'create_task', label: 'Create task', hint: 'Add a new task to a project in scope.' },
      { key: 'write_task', label: 'Write', hint: 'Edit any field of a task, including dates and status.' },
    ],
  },
  {
    key: 'docs',
    label: 'Docs',
    hint: 'Always on: read docs and pages.',
    scope: 'project',
    permissions: [
      { key: 'create_doc', label: 'Create doc', hint: 'Create a new doc in a project in scope.' },
      { key: 'create_page', label: 'Create page', hint: 'Add a page to a doc.' },
      { key: 'write_page', label: 'Write', hint: 'Edit a page’s content.' },
    ],
  },
  {
    key: 'wiki',
    label: 'Wiki',
    hint: 'Always on: read and search.',
    scope: 'wiki',
    permissions: [
      { key: 'create_wiki', label: 'Create wiki', hint: 'Create a new wiki.' },
      { key: 'create_page', label: 'Create page', hint: 'Add a page to a wiki.' },
      { key: 'write_wiki', label: 'Write', hint: 'Edit wiki details and page content.' },
    ],
  },
];

function findModule(key: string): TokenModule | undefined {
  return TOKEN_MODULES.find((m) => m.key === key);
}

/* ------------------------------------------------------------------ grants */

/**
 * What a token may do: a module key is present exactly when the token reads
 * that module, and its array is the Create/Write permissions on top of that
 * read (design doc, "Read is drawn as a ticked checkbox that cannot be
 * unticked"). An absent key means the token does not reach that module at
 * all; `{}` is a token that reaches nothing yet.
 */
export type TokenGrants = Partial<Record<ModuleKey, string[]>>;

/**
 * A `grants` request body, validated against `TOKEN_MODULES`: every key must
 * name a declared module, every permission in its list must be one that
 * module declares, and `'read'` itself is never a listed permission — it is
 * implied by the module being present at all.
 */
export function parseTokenGrants(input: unknown): TokenGrants {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw domainError('E_INVALID_DOC', 'Send grants as an object keyed by module.');
  }
  const result: TokenGrants = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const mod = findModule(key);
    if (!mod) throw domainError('E_INVALID_DOC', 'Unknown module.', { module: key });
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw domainError('E_INVALID_DOC', 'Send permissions as a list of strings.', { module: key });
    }
    const allowed = new Set(mod.permissions.map((p) => p.key));
    const seen = new Set<string>();
    const permissions: string[] = [];
    for (const permission of value as string[]) {
      if (permission === 'read' || !allowed.has(permission)) {
        throw domainError('E_INVALID_DOC', 'Unknown permission.', { module: key, permission });
      }
      if (!seen.has(permission)) {
        seen.add(permission);
        permissions.push(permission);
      }
    }
    result[mod.key] = permissions;
  }
  return result;
}

/** Whether a token reads a module at all — the implied permission every module carries. */
export function hasModule(g: TokenGrants, m: ModuleKey): boolean {
  return Object.hasOwn(g, m);
}

/** Whether a token holds a specific Create/Write permission in a module (never true for `'read'` itself — use `hasModule`). */
export function hasGrant(g: TokenGrants, m: ModuleKey, permission: string): boolean {
  return g[m]?.includes(permission) ?? false;
}

/**
 * `TokenGrants` as the rows a grant table stores: one `{module,'read'}` row
 * for every module the token reaches, then one row per Create/Write
 * permission. The inverse of `grantsFromRows`.
 */
export function grantRows(g: TokenGrants): Array<{ module: ModuleKey; permission: string }> {
  const rows: Array<{ module: ModuleKey; permission: string }> = [];
  for (const mod of TOKEN_MODULES) {
    const permissions = g[mod.key];
    if (permissions === undefined) continue;
    rows.push({ module: mod.key, permission: 'read' });
    for (const permission of permissions) rows.push({ module: mod.key, permission });
  }
  return rows;
}

/**
 * Grant rows read back from storage, as `TokenGrants`. A row naming a module
 * or permission this build does not declare is ignored rather than refused —
 * storage can outlive a declaration that was since removed.
 */
export function grantsFromRows(rows: ReadonlyArray<{ module: string; permission: string }>): TokenGrants {
  const result: TokenGrants = {};
  for (const row of rows) {
    const mod = findModule(row.module);
    if (!mod) continue;
    if (!Object.hasOwn(result, mod.key)) result[mod.key] = [];
    if (row.permission === 'read') continue;
    if (!mod.permissions.some((p) => p.key === row.permission)) continue;
    const permissions = result[mod.key]!;
    if (!permissions.includes(row.permission)) permissions.push(row.permission);
  }
  return result;
}

/* ------------------------------------------------------------------- scope */

/** What a token is scoped to: the projects it may reach, and the wikis it may reach. */
export type TokenScope = { projectIds: string[]; wikiIds: string[] };

/** What the caller — the token's owner — can currently see, by scope kind. */
export type Visible = { project: ReadonlySet<string>; wiki: ReadonlySet<string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One scope list: lowercased, deduplicated in order. A malformed id and one
 * that is simply not visible to the caller are refused identically, with
 * `E_NOT_FOUND` — the same existence-leak rule as everywhere else in the
 * product (spec §8): telling the two apart would tell a caller whether a
 * project or wiki they cannot see exists at all.
 */
function parseScopeList(raw: unknown, visible: ReadonlySet<string>): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of list) {
    const id = typeof entry === 'string' ? entry.toLowerCase() : '';
    if (!UUID_RE.test(id) || !visible.has(id)) {
      throw domainError('E_NOT_FOUND', 'That does not exist.');
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** A `scope` request body — `{ projectIds?, wikiIds? }`. A missing key means "none". */
export function parseTokenScope(input: unknown, visible: Visible): TokenScope {
  const obj = (input ?? {}) as Record<string, unknown>;
  return {
    projectIds: parseScopeList(obj.projectIds, visible.project),
    wikiIds: parseScopeList(obj.wikiIds, visible.wiki),
  };
}

/**
 * Scope that follows the grants it is stored with: a scope kind survives
 * only while some granted module declares it (design doc, "Scope stays a
 * stored list of concrete ids, never an 'everything' flag"). Dropping the
 * last module of a kind drops its ids rather than leaving them stored and
 * unreachable.
 */
export function normalizeScope(g: TokenGrants, s: TokenScope): TokenScope {
  const kinds = new Set(TOKEN_MODULES.filter((m) => hasModule(g, m.key)).map((m) => m.scope));
  return {
    projectIds: kinds.has('project') ? s.projectIds : [],
    wikiIds: kinds.has('wiki') ? s.wikiIds : [],
  };
}

/* ----------------------------------------------------------------- tokens */

/** `token_prefix` is the first 8 characters of the secret after `pmw_`. */
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

export type TokenStatus = 'active' | 'revoked' | 'expired';

/** Revoked outranks expired: revoking is the act a person took, expiry is the calendar's. */
export function tokenStatus(t: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): TokenStatus {
  if (t.revokedAt !== null) return 'revoked';
  if (t.expiresAt !== null && t.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/** `token_last_used_at` is written at most once a minute per token. */
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
 * The label and expiry shared by every token create/edit body, split out of
 * the old `parseTokenInput` so wiki tokens and the rest of the central MCP
 * tokens work share one implementation of this part.
 */
export function parseTokenBasics(input: unknown): { label: string; expiresAt: Date | null } {
  const obj = (input ?? {}) as Record<string, unknown>;

  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  if (!label) throw domainError('E_INVALID_DOC', 'A token needs a label.');
  if (label.length > MAX_LABEL_LENGTH) {
    throw domainError('E_INVALID_DOC', 'That label is too long.', { label });
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

  return { label, expiresAt };
}

/**
 * What a token may reach right now (spec §6b, generalised to every scope
 * kind):
 *
 * > effective scope = token scope ∩ what the token's owner can see right now
 *
 * — and nothing at all if the token is revoked, expired, or its owner is
 * inactive. Stored scope is never consulted for existence on its own; it
 * only ever narrows what is already visible, so losing and regaining
 * membership take effect immediately with nothing to clean up.
 */
export function effectiveScope(t: TokenFacts, stored: TokenScope, visible: Visible, now: Date): TokenScope {
  if (t.revokedAt !== null) return { projectIds: [], wikiIds: [] };
  if (t.expiresAt !== null && t.expiresAt.getTime() <= now.getTime()) return { projectIds: [], wikiIds: [] };
  if (!t.ownerActive) return { projectIds: [], wikiIds: [] };
  return {
    projectIds: intersectOrdered(stored.projectIds, visible.project),
    wikiIds: intersectOrdered(stored.wikiIds, visible.wiki),
  };
}

function intersectOrdered(ids: readonly string[], visible: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (visible.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
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
