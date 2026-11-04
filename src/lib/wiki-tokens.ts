import 'server-only';
import { and, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, wikiTokenScopes, wikiTokens, wikis } from '@/db/schema';
import { domainError } from '@/lib/errors';
import { requireWiki, visibleWikiIds, wikiViewer } from '@/lib/wiki';
import {
  LAST_USED_GRANULARITY_MS, MAX_ACTIVE_TOKENS, bearerSecret, effectiveTokenWikis, hashTokenSecret,
  isInstallAdmin, isUuid, newTokenSecret, parseTokenInput, shouldTouchLastUsed, tokenStatus,
  type TokenStatus,
} from '@/lib/wiki-rules';

/**
 * Personal access tokens for the wiki (spec §6). The secret exists in the
 * clear exactly once — in `createToken`'s return value — and only its
 * SHA-256 and an 8-character prefix are stored. Nothing here ever selects
 * `wiki_token_hash` for a caller to see: it is only ever compared against.
 */

export type TokenRow = {
  id: string; label: string; prefix: string;
  ownerId: string; ownerName: string; ownerEmail: string;
  wikis: Array<{ id: string; title: string }>;
  createdAt: string; lastUsedAt: string | null; expiresAt: string | null;
  status: TokenStatus;
};

const noToken = () => domainError('E_NOT_FOUND', 'No such token.');

/** Every column a caller may see. `hash` is deliberately absent. */
const visibleColumns = {
  id: wikiTokens.id, label: wikiTokens.label, prefix: wikiTokens.prefix, ownerId: wikiTokens.ownerId,
  createdAt: wikiTokens.createdAt, lastUsedAt: wikiTokens.lastUsedAt,
  expiresAt: wikiTokens.expiresAt, revokedAt: wikiTokens.revokedAt,
  ownerName: users.fullName, ownerEmail: users.email,
};

/** Live means neither revoked nor past its expiry, as one predicate (≡ `tokenStatus(...) === 'active'`). */
const isLive = (now: Date) => and(
  isNull(wikiTokens.revokedAt),
  or(isNull(wikiTokens.expiresAt), gt(wikiTokens.expiresAt, now)),
);

/**
 * Rows in the TokenRow shape. The scoped wikis listed are only those the
 * viewer can see right now — a scope row for a wiki they have lost access to
 * stays in the table (spec §6b) but is not named to them.
 */
async function tokenRows(viewerId: string, where: SQL): Promise<TokenRow[]> {
  const [rows, visible] = await Promise.all([
    db.select(visibleColumns).from(wikiTokens)
      .innerJoin(users, eq(users.id, wikiTokens.ownerId))
      .where(where)
      .orderBy(desc(wikiTokens.createdAt), wikiTokens.id),
    visibleWikiIds(viewerId),
  ]);
  if (!rows.length) return [];
  const scopes = await db.select({ tokenId: wikiTokenScopes.tokenId, id: wikis.id, title: wikis.title })
    .from(wikiTokenScopes)
    .innerJoin(wikis, eq(wikis.id, wikiTokenScopes.wikiId))
    .where(inArray(wikiTokenScopes.tokenId, rows.map((r) => r.id)))
    .orderBy(wikis.title, wikis.id);
  const byToken = new Map<string, Array<{ id: string; title: string }>>();
  for (const s of scopes) {
    if (!visible.has(s.id)) continue;
    const list = byToken.get(s.tokenId) ?? [];
    list.push({ id: s.id, title: s.title });
    byToken.set(s.tokenId, list);
  }
  const now = new Date();
  return rows.map((r) => ({
    id: r.id, label: r.label, prefix: r.prefix,
    ownerId: r.ownerId, ownerName: r.ownerName, ownerEmail: r.ownerEmail,
    wikis: byToken.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    status: tokenStatus(r, now),
  }));
}

async function oneRow(viewerId: string, tokenId: string): Promise<TokenRow> {
  const [row] = await tokenRows(viewerId, eq(wikiTokens.id, tokenId));
  if (!row) throw noToken();
  return row;
}

export async function listMyTokens(userId: string): Promise<TokenRow[]> {
  return tokenRows(userId, eq(wikiTokens.ownerId, userId));
}

/** The admin view (spec §6c). Anyone else is told there is no such list. */
export async function listAllTokens(userId: string): Promise<TokenRow[]> {
  if (!isInstallAdmin(await wikiViewer(userId))) throw domainError('E_NOT_FOUND', 'Not found.');
  return tokenRows(userId, sql`true`);
}

export async function createToken(userId: string, input: unknown): Promise<{ token: TokenRow; secret: string }> {
  const viewer = await wikiViewer(userId);
  if (!viewer.active) throw domainError('E_FORBIDDEN', 'This account is not active.');
  const data = parseTokenInput(input, await visibleWikiIds(userId));
  const { secret, hash, prefix } = newTokenSecret();

  const tokenId = await db.transaction(async (tx) => {
    // The owner's row is the lock: two creates at once cannot both see 19.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [counted] = await tx.select({ live: sql<number>`count(*)::int` }).from(wikiTokens)
      .where(and(eq(wikiTokens.ownerId, userId), isLive(new Date())));
    if ((counted?.live ?? 0) >= MAX_ACTIVE_TOKENS) {
      throw domainError('E_INVALID_DOC', `You already have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);
    }
    const [row] = await tx.insert(wikiTokens)
      .values({ ownerId: userId, label: data.label, hash, prefix, expiresAt: data.expiresAt })
      .returning({ id: wikiTokens.id });
    if (data.wikiIds.length) {
      await tx.insert(wikiTokenScopes).values(data.wikiIds.map((wikiId) => ({ tokenId: row!.id, wikiId })));
    }
    return row!.id;
  });

  return { token: await oneRow(userId, tokenId), secret };
}

/** The caller's own token that has not been revoked, or E_NOT_FOUND. */
async function requireOwnToken(userId: string, tokenId: string): Promise<void> {
  if (!isUuid(tokenId)) throw noToken();
  const [row] = await db.select({ id: wikiTokens.id }).from(wikiTokens)
    .where(and(eq(wikiTokens.id, tokenId), eq(wikiTokens.ownerId, userId), isNull(wikiTokens.revokedAt)))
    .limit(1);
  if (!row) throw noToken();
}

/**
 * Rename and rescope, owner only. Only scopes on wikis the owner can see are
 * touched: a scope kept for a wiki they have lost access to stays, so it
 * comes back if access does (spec §6b). Expiry is set at creation only.
 */
export async function updateToken(userId: string, tokenId: string, input: unknown): Promise<TokenRow> {
  await requireOwnToken(userId, tokenId);
  const visible = await visibleWikiIds(userId);
  const { label, wikiIds } = parseTokenInput({ ...((input ?? {}) as object), expiresAt: null }, visible);

  await db.transaction(async (tx) => {
    await tx.update(wikiTokens).set({ label }).where(eq(wikiTokens.id, tokenId));
    const dropped = [...visible].filter((id) => !wikiIds.includes(id));
    if (dropped.length) {
      await tx.delete(wikiTokenScopes)
        .where(and(eq(wikiTokenScopes.tokenId, tokenId), inArray(wikiTokenScopes.wikiId, dropped)));
    }
    if (wikiIds.length) {
      await tx.insert(wikiTokenScopes).values(wikiIds.map((wikiId) => ({ tokenId, wikiId }))).onConflictDoNothing();
    }
  });
  return oneRow(userId, tokenId);
}

/**
 * "Allow my token" from the wiki's settings: the ticked tokens get this wiki,
 * the caller's other live tokens lose it. Every id must be the caller's own
 * live token — anyone else's, or a revoked one, is E_NOT_FOUND.
 */
export async function allowWikiOnMyTokens(userId: string, wikiId: string, tokenIds: string[]): Promise<void> {
  const { wiki } = await requireWiki(userId, wikiId, 'write');
  const now = new Date();
  const mine = tokenIds.length
    ? await db.select({ id: wikiTokens.id }).from(wikiTokens)
      .where(and(inArray(wikiTokens.id, tokenIds), eq(wikiTokens.ownerId, userId), isLive(now)))
    : [];
  if (mine.length !== tokenIds.length) throw noToken();

  await db.transaction(async (tx) => {
    const others = tx.select({ id: wikiTokens.id }).from(wikiTokens)
      .where(and(
        eq(wikiTokens.ownerId, userId), isLive(now),
        ...(tokenIds.length ? [notInArray(wikiTokens.id, tokenIds)] : []),
      ));
    await tx.delete(wikiTokenScopes)
      .where(and(eq(wikiTokenScopes.wikiId, wiki.id), inArray(wikiTokenScopes.tokenId, others)));
    if (tokenIds.length) {
      await tx.insert(wikiTokenScopes).values(tokenIds.map((tokenId) => ({ tokenId, wikiId: wiki.id }))).onConflictDoNothing();
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
    db.select({ ownerId: wikiTokens.ownerId }).from(wikiTokens).where(eq(wikiTokens.id, tokenId)).limit(1),
  ]);
  if (!row || (row.ownerId !== userId && !isInstallAdmin(viewer))) throw noToken();
  await db.update(wikiTokens)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(eq(wikiTokens.id, tokenId), isNull(wikiTokens.revokedAt)));
}

/**
 * The MCP endpoint's whole authentication (spec §6b), run on every request.
 * One indexed lookup by hash; `null` for anything that is not a live token
 * of an active owner. A token that resolves but reaches no wiki returns an
 * empty list, not null — it is a valid token with nothing to read.
 *
 * `last_used_at` is written only for a token that was accepted, and at most
 * once a minute, so a busy client does not turn every read into a write.
 */
export async function resolveBearer(header: string | null): Promise<{ tokenId: string; ownerId: string; wikiIds: string[] } | null> {
  const secret = bearerSecret(header);
  if (!secret) return null;
  const [row] = await db.select({
    id: wikiTokens.id, ownerId: wikiTokens.ownerId, lastUsedAt: wikiTokens.lastUsedAt,
    expiresAt: wikiTokens.expiresAt, revokedAt: wikiTokens.revokedAt, ownerActive: users.isActive,
  }).from(wikiTokens)
    .innerJoin(users, eq(users.id, wikiTokens.ownerId))
    .where(eq(wikiTokens.hash, hashTokenSecret(secret)))
    .limit(1);
  if (!row) return null;

  const now = new Date();
  if (!row.ownerActive || tokenStatus(row, now) !== 'active') return null;

  const [scopes, visible] = await Promise.all([
    db.select({ wikiId: wikiTokenScopes.wikiId }).from(wikiTokenScopes).where(eq(wikiTokenScopes.tokenId, row.id)),
    visibleWikiIds(row.ownerId),
  ]);
  const wikiIds = effectiveTokenWikis(row, scopes.map((s) => s.wikiId), visible, now);

  if (shouldTouchLastUsed(row.lastUsedAt, now)) {
    // The guard is repeated in SQL so two concurrent requests write once.
    await db.update(wikiTokens).set({ lastUsedAt: now }).where(and(
      eq(wikiTokens.id, row.id),
      or(isNull(wikiTokens.lastUsedAt), lt(wikiTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_GRANULARITY_MS))),
    ));
  }
  return { tokenId: row.id, ownerId: row.ownerId, wikiIds };
}
