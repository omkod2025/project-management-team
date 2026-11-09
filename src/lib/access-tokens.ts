import 'server-only';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { accessTokenGrants, accessTokenScopes, accessTokens, projects, users, wikis } from '@/db/schema';
import { domainError } from '@/lib/errors';
import { visibleProjectIds } from '@/lib/project-access';
import { requireWiki, visibleWikiIds, wikiViewer } from '@/lib/wiki';
import { isInstallAdmin, isUuid } from '@/lib/wiki-rules';
import {
  LAST_USED_GRANULARITY_MS, MAX_ACTIVE_TOKENS, TOKEN_MODULES, bearerSecret, effectiveScope,
  grantRows, grantsFromRows, hashTokenSecret, newTokenSecret, normalizeScope,
  parseTokenBasics, parseTokenGrants, parseTokenScope, scopeKindsInUse, shouldTouchLastUsed, tokenStatus,
  type ScopeKind, type TokenGrants, type TokenScope, type TokenStatus, type Visible,
} from '@/lib/token-rules';

/**
 * Personal access tokens, system-wide (central MCP tokens design; wiki spec
 * §6 for the parts that predate it). The secret exists in the clear exactly
 * once — in `createToken`'s return value — and only its SHA-256 and an
 * 8-character prefix are stored. Nothing here ever selects
 * `access_token_hash` for a caller to see: it is only ever compared against.
 *
 * What a token may do is its grants (one row per module it reads, plus one
 * per Create/Write permission); what it may reach is its scope (one row per
 * project or wiki). Both are decided by `token-rules.ts`; this module loads
 * rows, asks it, and writes the answer back.
 */

export type TokenRow = {
  id: string; label: string; prefix: string;
  ownerId: string; ownerName: string; ownerEmail: string;
  grants: TokenGrants;
  projects: Array<{ id: string; name: string }>;
  wikis: Array<{ id: string; title: string }>;
  createdAt: string; lastUsedAt: string | null; expiresAt: string | null;
  status: TokenStatus;
};

/** What the MCP endpoint knows about the caller once a Bearer token resolves. */
export type McpAuth = { tokenId: string; ownerId: string; grants: TokenGrants; scope: TokenScope };

const noToken = () => domainError('E_NOT_FOUND', 'No such token.');

/** Every column a caller may see. `hash` is deliberately absent. */
const visibleColumns = {
  id: accessTokens.id, label: accessTokens.label, prefix: accessTokens.prefix, ownerId: accessTokens.ownerId,
  createdAt: accessTokens.createdAt, lastUsedAt: accessTokens.lastUsedAt,
  expiresAt: accessTokens.expiresAt, revokedAt: accessTokens.revokedAt,
  ownerName: users.fullName, ownerEmail: users.email,
};

/** Live means neither revoked nor past its expiry, as one predicate (≡ `tokenStatus(...) === 'active'`). */
const isLive = (now: Date) => and(
  isNull(accessTokens.revokedAt),
  or(isNull(accessTokens.expiresAt), gt(accessTokens.expiresAt, now)),
);

/** The scope column and request key for each scope kind. */
const SCOPE_KINDS = [
  { kind: 'project', column: accessTokenScopes.projectId, key: 'projectIds' },
  { kind: 'wiki', column: accessTokenScopes.wikiId, key: 'wikiIds' },
] as const satisfies ReadonlyArray<{ kind: ScopeKind; column: unknown; key: keyof TokenScope }>;

/** Everything the person can see right now, by scope kind. */
async function visibleTo(userId: string): Promise<Visible> {
  const [project, wiki] = await Promise.all([visibleProjectIds(userId), visibleWikiIds(userId)]);
  return { project, wiki };
}

/** Declaration order — module, then `read`, then the module's own permission order — so grants read back the same way every time. */
function grantRank(row: { module: string; permission: string }): number {
  const m = TOKEN_MODULES.findIndex((x) => x.key === row.module);
  const p = row.permission === 'read' ? -1 : (TOKEN_MODULES[m]?.permissions.findIndex((x) => x.key === row.permission) ?? 0);
  return m * 100 + p;
}

function grantsOf(rows: ReadonlyArray<{ module: string; permission: string }>): TokenGrants {
  return grantsFromRows([...rows].sort((a, b) => grantRank(a) - grantRank(b)));
}

function scopeRows(tokenId: string, scope: TokenScope) {
  return [
    ...scope.projectIds.map((projectId) => ({ tokenId, projectId })),
    ...scope.wikiIds.map((wikiId) => ({ tokenId, wikiId })),
  ];
}

function groupBy<T extends { tokenId: string }>(rows: readonly T[], keep: (row: T) => boolean): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    if (!keep(row)) continue;
    const list = result.get(row.tokenId) ?? [];
    list.push(row);
    result.set(row.tokenId, list);
  }
  return result;
}

/**
 * Rows in the TokenRow shape. The scoped projects and wikis listed are only
 * those the viewer can see right now — a scope row for something they have
 * lost access to stays in the table (spec §6b) but is not named to them.
 */
async function tokenRows(viewerId: string, where: SQL): Promise<TokenRow[]> {
  const [rows, visible] = await Promise.all([
    db.select(visibleColumns).from(accessTokens)
      .innerJoin(users, eq(users.id, accessTokens.ownerId))
      .where(where)
      .orderBy(desc(accessTokens.createdAt), accessTokens.id),
    visibleTo(viewerId),
  ]);
  if (!rows.length) return [];
  const tokenIds = rows.map((r) => r.id);
  const [grants, projectScopes, wikiScopes] = await Promise.all([
    db.select({ tokenId: accessTokenGrants.tokenId, module: accessTokenGrants.module, permission: accessTokenGrants.permission })
      .from(accessTokenGrants)
      .where(inArray(accessTokenGrants.tokenId, tokenIds)),
    db.select({ tokenId: accessTokenScopes.tokenId, id: projects.id, name: projects.name })
      .from(accessTokenScopes)
      .innerJoin(projects, eq(projects.id, accessTokenScopes.projectId))
      .where(inArray(accessTokenScopes.tokenId, tokenIds))
      .orderBy(projects.name, projects.id),
    db.select({ tokenId: accessTokenScopes.tokenId, id: wikis.id, title: wikis.title })
      .from(accessTokenScopes)
      .innerJoin(wikis, eq(wikis.id, accessTokenScopes.wikiId))
      .where(inArray(accessTokenScopes.tokenId, tokenIds))
      .orderBy(wikis.title, wikis.id),
  ]);
  const grantsByToken = groupBy(grants, () => true);
  const projectsByToken = groupBy(projectScopes, (s) => visible.project.has(s.id));
  const wikisByToken = groupBy(wikiScopes, (s) => visible.wiki.has(s.id));
  const now = new Date();
  return rows.map((r) => ({
    id: r.id, label: r.label, prefix: r.prefix,
    ownerId: r.ownerId, ownerName: r.ownerName, ownerEmail: r.ownerEmail,
    grants: grantsOf(grantsByToken.get(r.id) ?? []),
    projects: (projectsByToken.get(r.id) ?? []).map((s) => ({ id: s.id, name: s.name })),
    wikis: (wikisByToken.get(r.id) ?? []).map((s) => ({ id: s.id, title: s.title })),
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    status: tokenStatus(r, now),
  }));
}

async function oneRow(viewerId: string, tokenId: string): Promise<TokenRow> {
  const [row] = await tokenRows(viewerId, eq(accessTokens.id, tokenId));
  if (!row) throw noToken();
  return row;
}

/** A field of a JSON body, and whether it was sent at all — an omitted field and one sent as `null` mean different things to an edit. */
function field(input: unknown, key: string): { present: boolean; value: unknown } {
  if (!input || typeof input !== 'object' || !Object.hasOwn(input, key)) return { present: false, value: undefined };
  return { present: true, value: (input as Record<string, unknown>)[key] };
}

export async function listMyTokens(userId: string): Promise<TokenRow[]> {
  return tokenRows(userId, eq(accessTokens.ownerId, userId));
}

/** The admin view (spec §6c). Anyone else is told there is no such list. */
export async function listAllTokens(userId: string): Promise<TokenRow[]> {
  if (!isInstallAdmin(await wikiViewer(userId))) throw domainError('E_NOT_FOUND', 'Not found.');
  return tokenRows(userId, sql`true`);
}

/**
 * `{ label, expiresAt?, grants, scope: { projectIds?, wikiIds? } }`. Scope is
 * checked against what the caller can see — anything else is E_NOT_FOUND —
 * and then kept only for the kinds a granted module uses.
 */
export async function createToken(userId: string, input: unknown): Promise<{ token: TokenRow; secret: string }> {
  const basics = parseTokenBasics(input);
  const grants = parseTokenGrants(field(input, 'grants').value);
  const [viewer, visible] = await Promise.all([wikiViewer(userId), visibleTo(userId)]);
  if (!viewer.active) throw domainError('E_FORBIDDEN', 'This account is not active.');
  const scope = normalizeScope(grants, parseTokenScope(field(input, 'scope').value, visible));
  const { secret, hash, prefix } = newTokenSecret();

  const tokenId = await db.transaction(async (tx) => {
    // The owner's row is the lock: two creates at once cannot both see 19.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [counted] = await tx.select({ live: sql<number>`count(*)::int` }).from(accessTokens)
      .where(and(eq(accessTokens.ownerId, userId), isLive(new Date())));
    if ((counted?.live ?? 0) >= MAX_ACTIVE_TOKENS) {
      throw domainError('E_INVALID_DOC', `You already have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);
    }
    const [row] = await tx.insert(accessTokens)
      .values({ ownerId: userId, label: basics.label, hash, prefix, expiresAt: basics.expiresAt })
      .returning({ id: accessTokens.id });
    const id = row!.id;
    const grantValues = grantRows(grants).map((g) => ({ tokenId: id, ...g }));
    if (grantValues.length) await tx.insert(accessTokenGrants).values(grantValues);
    const scopeValues = scopeRows(id, scope);
    if (scopeValues.length) await tx.insert(accessTokenScopes).values(scopeValues);
    return id;
  });

  return { token: await oneRow(userId, tokenId), secret };
}

/** The caller's own token that has not been revoked, or E_NOT_FOUND. */
async function requireOwnToken(userId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) throw noToken();
  const [row] = await db.select({ id: accessTokens.id }).from(accessTokens)
    .where(and(eq(accessTokens.id, tokenId), eq(accessTokens.ownerId, userId), isNull(accessTokens.revokedAt)))
    .limit(1);
  if (!row) throw noToken();
}

/**
 * Rename, regrant and rescope, owner only: `{ label, grants?, scope? }`.
 *
 * - An omitted `grants` keeps the current grants; a present one replaces
 *   them wholesale.
 * - An omitted `scope` keeps the current scope. A present one replaces it
 *   only within what the owner can see now: a scope kept for a project or
 *   wiki they have lost access to stays, so it comes back if access does
 *   (spec §6b).
 * - Whatever the body, scope of a kind no remaining module uses is removed,
 *   visible or not — dropping the List and Docs modules leaves no project
 *   ids behind.
 *
 * Expiry is set at creation only; `expiresAt` here is ignored.
 */
export async function updateToken(userId: string, tokenId: string, input: unknown): Promise<TokenRow> {
  await requireOwnToken(userId, tokenId);
  const { label } = parseTokenBasics({ ...((input ?? {}) as object), expiresAt: null });
  const grantsField = field(input, 'grants');
  const scopeField = field(input, 'scope');
  const newGrants = grantsField.present ? parseTokenGrants(grantsField.value) : null;

  const [visible, currentGrants] = await Promise.all([
    visibleTo(userId),
    newGrants ? Promise.resolve(null) : db.select({ module: accessTokenGrants.module, permission: accessTokenGrants.permission })
      .from(accessTokenGrants).where(eq(accessTokenGrants.tokenId, tokenId)),
  ]);
  const grants = newGrants ?? grantsOf(currentGrants ?? []);
  const scope = scopeField.present ? normalizeScope(grants, parseTokenScope(scopeField.value, visible)) : null;
  const inUse = scopeKindsInUse(grants);

  await db.transaction(async (tx) => {
    await tx.update(accessTokens).set({ label }).where(eq(accessTokens.id, tokenId));
    if (newGrants) {
      await tx.delete(accessTokenGrants).where(eq(accessTokenGrants.tokenId, tokenId));
      const grantValues = grantRows(newGrants).map((g) => ({ tokenId, ...g }));
      if (grantValues.length) await tx.insert(accessTokenGrants).values(grantValues);
    }
    for (const { kind, column, key } of SCOPE_KINDS) {
      if (!inUse.has(kind)) {
        await tx.delete(accessTokenScopes).where(and(eq(accessTokenScopes.tokenId, tokenId), isNotNull(column)));
        continue;
      }
      if (!scope) continue;
      const wanted = scope[key];
      const dropped = [...visible[kind]].filter((id) => !wanted.includes(id));
      if (dropped.length) {
        await tx.delete(accessTokenScopes)
          .where(and(eq(accessTokenScopes.tokenId, tokenId), inArray(column, dropped)));
      }
    }
    const scopeValues = scope ? scopeRows(tokenId, scope) : [];
    if (scopeValues.length) await tx.insert(accessTokenScopes).values(scopeValues).onConflictDoNothing();
  });
  return oneRow(userId, tokenId);
}

/**
 * "Allow my token" from the wiki's settings: the ticked tokens get this wiki,
 * the caller's other live tokens lose it. Every id must be the caller's own
 * live token — anyone else's, or a revoked one, is E_NOT_FOUND.
 *
 * A ticked token that does not reach the Wiki module yet gains it read-only
 * (central MCP tokens design, call 4): allowing a wiki on a token that could
 * not read wikis would otherwise store a scope nothing uses.
 */
export async function allowWikiOnMyTokens(userId: string, wikiId: string, tokenIds: string[]): Promise<void> {
  const { wiki } = await requireWiki(userId, wikiId, 'write');
  const now = new Date();
  const mine = tokenIds.length
    ? await db.select({ id: accessTokens.id }).from(accessTokens)
      .where(and(inArray(accessTokens.id, tokenIds), eq(accessTokens.ownerId, userId), isLive(now)))
    : [];
  if (mine.length !== tokenIds.length) throw noToken();

  await db.transaction(async (tx) => {
    const others = tx.select({ id: accessTokens.id }).from(accessTokens)
      .where(and(
        eq(accessTokens.ownerId, userId), isLive(now),
        ...(tokenIds.length ? [notInArray(accessTokens.id, tokenIds)] : []),
      ));
    await tx.delete(accessTokenScopes)
      .where(and(eq(accessTokenScopes.wikiId, wiki.id), inArray(accessTokenScopes.tokenId, others)));
    if (tokenIds.length) {
      await tx.insert(accessTokenGrants)
        .values(tokenIds.map((tokenId) => ({ tokenId, module: 'wiki', permission: 'read' })))
        .onConflictDoNothing();
      await tx.insert(accessTokenScopes)
        .values(tokenIds.map((tokenId) => ({ tokenId, wikiId: wiki.id })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Revoke, irreversibly (spec §6a): the owner, or the install admin for any
 * token. Anyone else learns nothing — the same 404 as an unknown id.
 * Revoking an already revoked token keeps the first revocation's record.
 */
export async function revokeToken(userId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) throw noToken();
  const [viewer, [row]] = await Promise.all([
    wikiViewer(userId),
    db.select({ ownerId: accessTokens.ownerId }).from(accessTokens).where(eq(accessTokens.id, tokenId)).limit(1),
  ]);
  if (!row || (row.ownerId !== userId && !isInstallAdmin(viewer))) throw noToken();
  await db.update(accessTokens)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(eq(accessTokens.id, tokenId), isNull(accessTokens.revokedAt)));
}

/**
 * The MCP endpoint's whole authentication (spec §6b), run on every request.
 * One indexed lookup by hash; `null` for anything that is not a live token
 * of an active owner. A token that resolves but reaches nothing returns empty
 * scope lists, not null — it is a valid token with nothing to read.
 *
 * The scope returned is already effective: stored scope ∩ what the owner can
 * see right now (`effectiveScope`), so a lost membership stops a token at
 * once and a regained one restores it, with nothing to clean up.
 *
 * `last_used_at` is written only for a token that was accepted, and at most
 * once a minute, so a busy client does not turn every read into a write.
 */
export async function resolveBearer(header: string | null): Promise<McpAuth | null> {
  const secret = bearerSecret(header);
  if (!secret) return null;
  const [row] = await db.select({
    id: accessTokens.id, ownerId: accessTokens.ownerId, lastUsedAt: accessTokens.lastUsedAt,
    expiresAt: accessTokens.expiresAt, revokedAt: accessTokens.revokedAt, ownerActive: users.isActive,
  }).from(accessTokens)
    .innerJoin(users, eq(users.id, accessTokens.ownerId))
    .where(eq(accessTokens.hash, hashTokenSecret(secret)))
    .limit(1);
  if (!row) return null;

  const now = new Date();
  if (!row.ownerActive || tokenStatus(row, now) !== 'active') return null;

  const [grantList, scopes, project, wiki] = await Promise.all([
    db.select({ module: accessTokenGrants.module, permission: accessTokenGrants.permission })
      .from(accessTokenGrants).where(eq(accessTokenGrants.tokenId, row.id)),
    db.select({ projectId: accessTokenScopes.projectId, wikiId: accessTokenScopes.wikiId })
      .from(accessTokenScopes).where(eq(accessTokenScopes.tokenId, row.id)),
    visibleProjectIds(row.ownerId),
    visibleWikiIds(row.ownerId),
  ]);
  const stored: TokenScope = {
    projectIds: scopes.flatMap((s) => (s.projectId ? [s.projectId] : [])),
    wikiIds: scopes.flatMap((s) => (s.wikiId ? [s.wikiId] : [])),
  };
  const scope = effectiveScope(row, stored, { project, wiki }, now);

  if (shouldTouchLastUsed(row.lastUsedAt, now)) {
    // The guard is repeated in SQL so two concurrent requests write once.
    await db.update(accessTokens).set({ lastUsedAt: now }).where(and(
      eq(accessTokens.id, row.id),
      or(isNull(accessTokens.lastUsedAt), lt(accessTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_GRANULARITY_MS))),
    ));
  }
  return { tokenId: row.id, ownerId: row.ownerId, grants: grantsOf(grantList), scope };
}
