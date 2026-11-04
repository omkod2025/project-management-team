import 'server-only';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, wikiMembers, wikis } from '@/db/schema';
import { domainError } from '@/lib/errors';
import {
  assertNotOwner, canManageWiki, canSeeWiki, canWriteWiki, isInstallAdmin, isUuid,
  parseMemberGrant, parseMemberRef, parseNewWiki, parseWikiUpdate, wikiRole,
  type WikiAccess, type WikiFacts, type WikiRole, type WikiViewer,
} from '@/lib/wiki-rules';

/**
 * The wiki adapter (spec §5). It loads facts, asks `wiki-rules.ts`, and
 * writes — every decision about who may do what is made there, not here.
 */

export type WikiSummary = {
  id: string; title: string; description: string;
  ownerId: string | null; ownerName: string | null;
  role: WikiRole; archived: boolean; published: boolean; updatedAt: string;
};

type WikiRow = typeof wikis.$inferSelect;

const notFound = () => domainError('E_NOT_FOUND', 'No such wiki.');

export async function wikiViewer(userId: string): Promise<WikiViewer> {
  const [row] = await db.select({ email: users.email, active: users.isActive })
    .from(users).where(eq(users.id, userId)).limit(1);
  return { userId, email: row?.email ?? '', active: row?.active ?? false };
}

/**
 * `canSeeWiki` as one SQL predicate over `pmt_wikis`, for lists and token
 * scoping. It must stay equivalent to the TypeScript rule, clause by clause:
 *
 *   wikiRole → null when inactive     ⇔  no predicate at all (callers return early)
 *   role 'install' (sees everything)  ⇔  ${install}, decided by `isInstallAdmin`
 *   role 'owner' (archived or not)    ⇔  wiki_owner_id = viewer
 *   role 'write' | 'read', archived   ⇔  archived IS NULL AND a member row exists
 *     → only install/owner see it
 *
 * The install-admin test is not re-expressed in SQL: it is computed by the
 * pure function and bound as a boolean, so the email comparison lives in one
 * place.
 */
function visiblePredicate(v: WikiViewer): SQL {
  return sql`(
    ${isInstallAdmin(v)}::boolean
    OR ${wikis.ownerId} = ${v.userId}::uuid
    OR (${wikis.archivedAt} IS NULL AND EXISTS (
      SELECT 1 FROM pmt_wiki_members m
       WHERE m.wiki_member_wiki_id = ${wikis.id}
         AND m.wiki_member_user_id = ${v.userId}::uuid
    ))
  )`;
}

export async function visibleWikiIds(userId: string): Promise<Set<string>> {
  const v = await wikiViewer(userId);
  if (!v.active) return new Set();
  const rows = await db.select({ id: wikis.id }).from(wikis).where(visiblePredicate(v));
  return new Set(rows.map((r) => r.id));
}

function factsOf(w: WikiRow, memberAccess: WikiAccess | null): WikiFacts {
  return { ownerId: w.ownerId, archived: w.archivedAt !== null, memberAccess };
}

async function loadWiki(wikiId: string, userId: string) {
  const [row] = await db.select({ wiki: wikis, access: wikiMembers.access })
    .from(wikis)
    .leftJoin(wikiMembers, and(eq(wikiMembers.wikiId, wikis.id), eq(wikiMembers.userId, userId)))
    .where(eq(wikis.id, wikiId)).limit(1);
  return row;
}

/**
 * The gate every wiki route passes. Unseen and malformed ids are the same
 * 404 (spec §8, existence leaks); only someone who can already see the wiki
 * learns that they lack a right on it.
 */
export async function requireWiki(
  userId: string,
  wikiId: string,
  need: 'read' | 'write' | 'manage',
): Promise<{ wiki: WikiRow; role: WikiRole }> {
  if (!isUuid(wikiId)) throw notFound();
  const [v, row] = await Promise.all([wikiViewer(userId), loadWiki(wikiId, userId)]);
  if (!row) throw notFound();
  const facts = factsOf(row.wiki, row.access);
  if (!canSeeWiki(v, facts)) throw notFound();
  if (need === 'write' && !canWriteWiki(v, facts)) {
    throw domainError('E_FORBIDDEN', 'You can read this wiki but not change it.');
  }
  if (need === 'manage' && !canManageWiki(v, facts)) {
    throw domainError('E_FORBIDDEN', 'Only the owner can change this wiki’s settings.');
  }
  return { wiki: row.wiki, role: wikiRole(v, facts)! };
}

async function ownerName(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const [row] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, ownerId)).limit(1);
  return row?.name ?? null;
}

function summarize(w: WikiRow, role: WikiRole, owner: string | null): WikiSummary {
  return {
    id: w.id, title: w.title, description: w.description,
    ownerId: w.ownerId, ownerName: owner, role,
    archived: w.archivedAt !== null, published: w.publicToken !== null,
    updatedAt: w.updatedAt.toISOString(),
  };
}

async function summaryFor(userId: string, wikiId: string): Promise<WikiSummary> {
  const { wiki, role } = await requireWiki(userId, wikiId, 'read');
  return summarize(wiki, role, await ownerName(wiki.ownerId));
}

export async function getWiki(userId: string, wikiId: string): Promise<WikiSummary> {
  return summaryFor(userId, wikiId);
}

export async function listWikis(userId: string): Promise<WikiSummary[]> {
  const v = await wikiViewer(userId);
  if (!v.active) return [];
  const rows = await db.select({ wiki: wikis, access: wikiMembers.access, ownerName: users.fullName })
    .from(wikis)
    .leftJoin(wikiMembers, and(eq(wikiMembers.wikiId, wikis.id), eq(wikiMembers.userId, userId)))
    .leftJoin(users, eq(users.id, wikis.ownerId))
    .where(visiblePredicate(v))
    .orderBy(sql`${wikis.archivedAt} IS NOT NULL`, desc(wikis.updatedAt), wikis.id);
  const result: WikiSummary[] = [];
  for (const r of rows) {
    const facts = factsOf(r.wiki, r.access);
    // The SQL predicate already filtered; the pure rule has the last word.
    if (!canSeeWiki(v, facts)) continue;
    result.push(summarize(r.wiki, wikiRole(v, facts)!, r.ownerName));
  }
  return result;
}

export async function createWiki(userId: string, input: unknown): Promise<WikiSummary> {
  const v = await wikiViewer(userId);
  if (!v.active) throw domainError('E_FORBIDDEN', 'This account is not active.');
  const data = parseNewWiki(input);
  const [wiki] = await db.insert(wikis).values({ ...data, ownerId: userId }).returning();
  const role = wikiRole(v, factsOf(wiki!, null))!;
  return summarize(wiki!, role, await ownerName(userId));
}

/** An active account, or E_NOT_FOUND — never granted to, or handed, a wiki otherwise. */
async function requireActiveUser(userId: string): Promise<void> {
  const [row] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), eq(users.isActive, true))).limit(1);
  if (!row) throw domainError('E_NOT_FOUND', 'No such person.');
}

export async function updateWiki(userId: string, wikiId: string, input: unknown): Promise<WikiSummary> {
  const { wiki } = await requireWiki(userId, wikiId, 'manage');
  const change = parseWikiUpdate(input);
  const now = new Date();

  switch (change.action) {
    case 'rename':
      await db.update(wikis).set({ title: change.title, updatedAt: now }).where(eq(wikis.id, wiki.id));
      break;
    case 'describe':
      await db.update(wikis).set({ description: change.description, updatedAt: now }).where(eq(wikis.id, wiki.id));
      break;
    case 'archive':
      if (wiki.archivedAt === null) {
        await db.update(wikis).set({ archivedAt: now, updatedAt: now }).where(eq(wikis.id, wiki.id));
      }
      break;
    case 'restore':
      await db.update(wikis).set({ archivedAt: null, updatedAt: now }).where(eq(wikis.id, wiki.id));
      break;
    case 'transfer':
      await transfer(userId, wiki.id, change.userId);
      break;
  }
  return summaryFor(userId, wiki.id);
}

/**
 * Ownership moves, and the previous owner stays on as a write member (spec
 * §5a) so their access and their tokens keep working. The new owner's own
 * member row goes, because an owner holds no member row (`assertNotOwner`).
 * One transaction, with the wiki row locked, so two concurrent transfers
 * cannot both read the same previous owner.
 */
async function transfer(actingUserId: string, wikiId: string, newOwnerId: string): Promise<void> {
  await requireActiveUser(newOwnerId);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select({ ownerId: wikis.ownerId }).from(wikis)
      .where(eq(wikis.id, wikiId)).for('update');
    if (!locked) throw notFound();
    assertNotOwner(newOwnerId, locked.ownerId);

    await tx.update(wikis).set({ ownerId: newOwnerId, updatedAt: new Date() }).where(eq(wikis.id, wikiId));
    await tx.delete(wikiMembers).where(and(eq(wikiMembers.wikiId, wikiId), eq(wikiMembers.userId, newOwnerId)));
    await tx.insert(wikiMembers)
      .values({ wikiId, userId: locked.ownerId, access: 'write', grantedBy: actingUserId })
      .onConflictDoUpdate({
        target: [wikiMembers.wikiId, wikiMembers.userId],
        set: { access: 'write', grantedBy: actingUserId, grantedAt: new Date() },
      });
  });
}

export async function listMembers(
  userId: string,
  wikiId: string,
): Promise<Array<{ userId: string; name: string; email: string; access: WikiAccess }>> {
  const { wiki } = await requireWiki(userId, wikiId, 'read');
  return db.select({ userId: wikiMembers.userId, name: users.fullName, email: users.email, access: wikiMembers.access })
    .from(wikiMembers)
    .innerJoin(users, eq(users.id, wikiMembers.userId))
    .where(eq(wikiMembers.wikiId, wiki.id))
    .orderBy(users.fullName, users.email);
}

export async function setMember(userId: string, wikiId: string, input: unknown): Promise<void> {
  const { wiki } = await requireWiki(userId, wikiId, 'manage');
  const grant = parseMemberGrant(input);
  await requireActiveUser(grant.userId);
  assertNotOwner(grant.userId, wiki.ownerId);
  await db.insert(wikiMembers)
    .values({ wikiId: wiki.id, userId: grant.userId, access: grant.access, grantedBy: userId })
    .onConflictDoUpdate({
      target: [wikiMembers.wikiId, wikiMembers.userId],
      set: { access: grant.access, grantedBy: userId, grantedAt: new Date() },
    });
}

export async function removeMember(userId: string, wikiId: string, input: unknown): Promise<void> {
  const { wiki } = await requireWiki(userId, wikiId, 'manage');
  const { userId: target } = parseMemberRef(input);
  await db.delete(wikiMembers).where(and(eq(wikiMembers.wikiId, wiki.id), eq(wikiMembers.userId, target)));
}
