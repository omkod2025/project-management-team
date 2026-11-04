import 'server-only';
import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, wikiMembers, wikiPages, wikiRevisions, wikis } from '@/db/schema';
import { DomainError, domainError } from '@/lib/errors';
import { extendRevision, nextPageDepth, parsePageContent, type DocPage } from '@/lib/doc-rules';
import {
  deleteQueuedWikiAssets, finalizeRemovedWikiAssets, lockWikiAssetReferences, stageRemovedWikiAssets,
  stageUploadedWikiAssets, validateAddedWikiAssets, type WikiAssetTransaction,
} from '@/lib/wiki-asset-cleanup';
import {
  assertNotOwner, canManageWiki, canSeeWiki, canWriteWiki, generatedPageSlug, isInstallAdmin, isUuid,
  likePattern, pageSearchText, parseMemberGrant, parseMemberRef, parseNewWiki, parseNewWikiPage, parsePageMove,
  parsePageTitle, parseWikiUpdate, searchSnippet, searchTerms, wikiRole,
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

async function loadWikiRow(wikiId: string, userId: string) {
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
): Promise<{ wiki: WikiRow; role: WikiRole; canWrite: boolean }> {
  if (!isUuid(wikiId)) throw notFound();
  const [v, row] = await Promise.all([wikiViewer(userId), loadWikiRow(wikiId, userId)]);
  if (!row) throw notFound();
  const facts = factsOf(row.wiki, row.access);
  if (!canSeeWiki(v, facts)) throw notFound();
  if (need === 'write' && !canWriteWiki(v, facts)) {
    throw domainError('E_FORBIDDEN', 'You can read this wiki but not change it.');
  }
  if (need === 'manage' && !canManageWiki(v, facts)) {
    throw domainError('E_FORBIDDEN', 'Only the owner can change this wiki’s settings.');
  }
  return { wiki: row.wiki, role: wikiRole(v, facts)!, canWrite: canWriteWiki(v, facts) };
}

/**
 * `requireWiki` for a request that named a page or an asset rather than the
 * wiki. Its 404 is rethrown as the resource's own not-found, identical to an
 * unknown id, so a stranger cannot tell a real id from a missing one (spec §8).
 */
export async function requireWikiOr(
  userId: string,
  wikiId: string,
  need: 'read' | 'write' | 'manage',
  missing: () => DomainError,
): Promise<{ wiki: WikiRow; role: WikiRole; canWrite: boolean }> {
  try {
    return await requireWiki(userId, wikiId, need);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'E_NOT_FOUND') throw missing();
    throw err;
  }
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
      // Archiving withdraws the public link (spec §5b) in the same write. A
      // withdrawn link never comes back: restoring does not re-publish, and
      // publishing again mints a new secret.
      await db.update(wikis)
        .set({ archivedAt: wiki.archivedAt ?? now, publicToken: null, updatedAt: now })
        .where(eq(wikis.id, wiki.id));
      break;
    case 'restore':
      await db.update(wikis).set({ archivedAt: null, updatedAt: now }).where(eq(wikis.id, wiki.id));
      break;
    case 'transfer':
      await transfer(userId, wiki.id, change.userId);
      break;
  }
  return summaryAfterChange(userId, wiki.id);
}

/**
 * The summary of a wiki the caller has just changed, with their role as it
 * now stands. Deliberately not re-gated through `requireWiki`: a transfer on
 * an archived wiki turns the acting owner into a write member, who cannot
 * see an archived wiki — re-gating would report a committed change as a 404.
 * The caller was authorised for the change itself; this only describes it.
 */
async function summaryAfterChange(userId: string, wikiId: string): Promise<WikiSummary> {
  const [v, row] = await Promise.all([wikiViewer(userId), loadWikiRow(wikiId, userId)]);
  if (!row) throw notFound();
  const role = wikiRole(v, factsOf(row.wiki, row.access));
  if (role === null) throw notFound();
  return summarize(row.wiki, role, await ownerName(row.wiki.ownerId));
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

/**
 * The active accounts a manager may grant access to or hand the wiki to, for
 * the settings pickers. Gated on `manage`: nobody else is shown the roster.
 */
export async function wikiPeopleChoices(
  userId: string,
  wikiId: string,
): Promise<Array<{ userId: string; name: string; email: string }>> {
  await requireWiki(userId, wikiId, 'manage');
  return db.select({ userId: users.id, name: users.fullName, email: users.email })
    .from(users).where(eq(users.isActive, true)).orderBy(users.fullName, users.email);
}

/* ------------------------------------------------------------------ pages */

export type WikiPage = {
  id: string; wikiId: string; parentId: string | null; depth: number;
  title: string; slug: string; body: string; updatedAt: string;
};

/** A wiki page in the shape the Docs page components take: always a Free page, bound to nothing. */
export const asDocPage = (p: WikiPage): DocPage => ({
  ...p, docId: p.wikiId, template: 'free', nodeId: null, content: { body: p.body }, nodeArchived: false, hue: null,
});

type PageRow = typeof wikiPages.$inferSelect;
type Tx = WikiAssetTransaction;

const pageNotFound = () => domainError('E_NOT_FOUND', 'No such page.');

function pageOf(p: PageRow): WikiPage {
  return {
    id: p.id, wikiId: p.wikiId, parentId: p.parentId, depth: p.depth,
    title: p.title, slug: p.slug, body: p.body, updatedAt: p.updatedAt.toISOString(),
  };
}

/** A strictly later instant than `after`, so an optimistic save always sees a change. */
const laterThan = (after: Date) => new Date(Math.max(Date.now(), after.getTime() + 1));

async function listPages(wikiId: string, archived: boolean): Promise<WikiPage[]> {
  const rows = await db.select().from(wikiPages)
    .where(and(eq(wikiPages.wikiId, wikiId), archived ? isNotNull(wikiPages.archivedAt) : isNull(wikiPages.archivedAt)))
    .orderBy(wikiPages.sortOrder, wikiPages.id);
  return rows.map(pageOf);
}

/**
 * Serialises every structural or content write in one wiki: the asset lock
 * first (as Docs does), then the wiki row. A wiki archived since the gate
 * was passed takes no more writes.
 */
async function lockWikiForWrite(tx: Tx, wikiId: string): Promise<void> {
  await lockWikiAssetReferences(tx, wikiId);
  const [locked] = await tx.select({ archivedAt: wikis.archivedAt }).from(wikis).where(eq(wikis.id, wikiId)).for('update');
  if (!locked) throw notFound();
  if (locked.archivedAt) throw domainError('E_FORBIDDEN', 'This wiki is archived. Restore it before changing its pages.');
}

const touchWiki = (tx: Tx, wikiId: string, at: Date) =>
  tx.update(wikis).set({ updatedAt: at }).where(eq(wikis.id, wikiId));

/** An active page and its wiki, gated on the wiki: a stranger gets the wiki's 404, not the page's. */
async function requirePage(userId: string, pageId: string, need: 'read' | 'write') {
  if (!isUuid(pageId)) throw pageNotFound();
  const [page] = await db.select().from(wikiPages)
    .where(and(eq(wikiPages.id, pageId), isNull(wikiPages.archivedAt))).limit(1);
  if (!page) throw pageNotFound();
  const { wiki } = await requireWikiOr(userId, page.wikiId, need, pageNotFound);
  return { page, wiki };
}

/** The page and every page below it, among `all`, following only children that pass `include`. */
function subtreeIds(all: readonly PageRow[], rootId: string, include: (p: PageRow) => boolean = () => true): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of all) {
      if (p.parentId && ids.has(p.parentId) && !ids.has(p.id) && include(p)) { ids.add(p.id); grew = true; }
    }
  }
  return ids;
}

export async function loadWiki(
  userId: string,
  wikiId: string,
): Promise<{ wiki: WikiSummary; pages: WikiPage[]; archivedPages: WikiPage[] }> {
  const { wiki, role, canWrite } = await requireWiki(userId, wikiId, 'read');
  const [owner, pages, archivedPages] = await Promise.all([
    ownerName(wiki.ownerId),
    listPages(wiki.id, false),
    canWrite ? listPages(wiki.id, true) : Promise.resolve([]),
  ]);
  return { wiki: summarize(wiki, role, owner), pages, archivedPages };
}

export async function loadWikiPageBySlug(
  userId: string,
  wikiId: string,
  slug: string,
): Promise<{ wiki: WikiSummary; pages: WikiPage[]; archivedPages: WikiPage[]; page: WikiPage }> {
  const data = await loadWiki(userId, wikiId);
  const page = data.pages.find((p) => p.slug === slug);
  if (!page) throw pageNotFound();
  return { ...data, page };
}

async function slugTaken(tx: Tx, wikiId: string, slug: string): Promise<boolean> {
  // Archived pages keep their slug (restore must bring it back), so they count.
  const [row] = await tx.select({ id: wikiPages.id }).from(wikiPages)
    .where(and(eq(wikiPages.wikiId, wikiId), eq(wikiPages.slug, slug))).limit(1);
  return Boolean(row);
}

/** A generated `page-xxxxxxxx` no other page of this wiki holds. Runs under the wiki lock. */
async function freshSlug(tx: Tx, wikiId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = generatedPageSlug();
    if (!(await slugTaken(tx, wikiId, slug))) return slug;
  }
  throw domainError('E_INVALID_DOC', 'Could not choose an address for this page. Try again.');
}

export async function createWikiPage(userId: string, wikiId: string, input: unknown): Promise<WikiPage> {
  const { wiki } = await requireWiki(userId, wikiId, 'write');
  const data = parseNewWikiPage(input);
  const body = data.body === undefined ? '' : parsePageContent({ body: data.body }, 'free').body!;
  return db.transaction(async (tx) => {
    await lockWikiForWrite(tx, wiki.id);
    let parentDepth: number | null = null;
    if (data.parentId) {
      const [parent] = await tx.select({ depth: wikiPages.depth }).from(wikiPages).where(and(
        eq(wikiPages.id, data.parentId), eq(wikiPages.wikiId, wiki.id), isNull(wikiPages.archivedAt),
      ));
      if (!parent) throw domainError('E_INVALID_DOC', 'Choose a parent page in this wiki.');
      parentDepth = parent.depth;
    }
    const depth = nextPageDepth(parentDepth);
    if (data.slug && await slugTaken(tx, wiki.id, data.slug)) {
      throw domainError('E_INVALID_DOC', 'Another page in this wiki already uses this address.');
    }
    const slug = data.slug ?? await freshSlug(tx, wiki.id);
    await validateAddedWikiAssets(tx, wiki.id, null, body);
    const now = new Date();
    const [page] = await tx.insert(wikiPages).values({
      wikiId: wiki.id, parentId: data.parentId, depth, title: data.title, slug, body,
      searchText: pageSearchText(data.title, body), sortOrder: Date.now(), updatedBy: userId, updatedAt: now,
    }).returning();
    await touchWiki(tx, wiki.id, now);
    return pageOf(page!);
  });
}

/**
 * The PageEditor save (`{ content: { body }, title, updatedAt, forceRevision,
 * finalizeAssets, uploadedAssets }`), with the rules of `saveDocPage`: 409 on
 * a stale `updatedAt` naming who changed it, one revision per editor per
 * half hour unless forced, and asset staging finalized only on Done.
 */
export async function saveWikiPage(
  userId: string,
  pageId: string,
  input: unknown,
): Promise<{ updatedAt: string; title: string; assetCleanupPending: number }> {
  const { wiki } = await requirePage(userId, pageId, 'write');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw domainError('E_INVALID_DOC', 'Invalid save.');
  const b = input as Record<string, unknown>;
  const body = parsePageContent(b.content, 'free').body!;
  const title = b.title === undefined ? undefined : parsePageTitle(b.title);
  if (typeof b.updatedAt !== 'string') throw domainError('E_INVALID_DOC', 'Reload this page before editing.');

  const result = await db.transaction(async (tx) => {
    await lockWikiForWrite(tx, wiki.id);
    const [current] = await tx.select().from(wikiPages).where(eq(wikiPages.id, pageId)).for('update');
    if (!current || current.archivedAt) throw pageNotFound();
    if (current.updatedAt.toISOString() !== b.updatedAt) {
      const [editor] = current.updatedBy
        ? await tx.select({ name: users.fullName }).from(users).where(eq(users.id, current.updatedBy))
        : [];
      const name = editor?.name ?? 'Another editor';
      throw domainError('E_DOC_CONFLICT', `${name} changed this page. Copy your draft before reloading.`,
        { updatedAt: current.updatedAt.toISOString(), updatedBy: name });
    }
    const now = laterThan(current.updatedAt);
    await validateAddedWikiAssets(tx, wiki.id, current.body, body);
    const [last] = await tx.select().from(wikiRevisions).where(eq(wikiRevisions.pageId, pageId))
      .orderBy(desc(wikiRevisions.updatedAt)).limit(1);
    if (last && b.forceRevision !== true && extendRevision(last.editorId, userId, last.updatedAt.getTime(), now.getTime())) {
      await tx.update(wikiRevisions).set({ content: body, updatedAt: now }).where(eq(wikiRevisions.id, last.id));
    } else {
      await tx.insert(wikiRevisions).values({ pageId, editorId: userId, content: body, updatedAt: now });
    }
    const finalTitle = title ?? current.title;
    await tx.update(wikiPages).set({
      body, title: finalTitle, searchText: pageSearchText(finalTitle, body), updatedBy: userId, updatedAt: now,
    }).where(eq(wikiPages.id, pageId));
    await touchWiki(tx, wiki.id, now);
    await stageRemovedWikiAssets(tx, wiki.id, pageId, current.body, body);
    await stageUploadedWikiAssets(tx, wiki.id, pageId, userId, b.uploadedAssets);
    if (b.finalizeAssets === true) await finalizeRemovedWikiAssets(tx, wiki.id, pageId);
    return { updatedAt: now.toISOString(), title: finalTitle };
  });
  const assetCleanupPending = b.finalizeAssets === true ? await deleteQueuedWikiAssets(wiki.id) : 0;
  return { ...result, assetCleanupPending };
}

/**
 * Re-parent and/or reorder a page. The whole subtree moves with it, so the
 * depth check covers every page below it (archived ones too, since they come
 * back where they were), and a page can never land inside its own subtree.
 * Without `beforeId` the page goes after its last sibling. A move is not an
 * edit: `updatedAt` is left alone so an open editor does not see a false
 * conflict.
 */
export async function moveWikiPage(userId: string, pageId: string, input: unknown): Promise<WikiPage> {
  const { wiki } = await requirePage(userId, pageId, 'write');
  const { parentId, beforeId } = parsePageMove(input);
  return db.transaction(async (tx) => {
    await lockWikiForWrite(tx, wiki.id);
    const all = await tx.select().from(wikiPages).where(eq(wikiPages.wikiId, wiki.id));
    const current = all.find((p) => p.id === pageId && !p.archivedAt);
    if (!current) throw pageNotFound();
    const parent = parentId ? all.find((p) => p.id === parentId && !p.archivedAt) : null;
    if (parentId && !parent) throw domainError('E_INVALID_DOC', 'Choose a parent page in this wiki.');
    const subtree = subtreeIds(all, pageId);
    if (parentId && subtree.has(parentId)) throw domainError('E_INVALID_DOC', 'A page cannot be moved inside itself.');
    const delta = (parent ? parent.depth + 1 : 1) - current.depth;
    if (all.some((p) => subtree.has(p.id) && p.depth + delta > 3)) {
      throw domainError('E_MAX_DEPTH', 'This move would exceed three page levels.');
    }

    const siblings = all
      .filter((p) => !p.archivedAt && p.parentId === parentId && p.id !== pageId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    let sortOrder = current.sortOrder;
    if (beforeId) {
      const at = siblings.findIndex((p) => p.id === beforeId);
      if (at === -1) throw domainError('E_INVALID_DOC', 'Choose a sibling page to move before.');
      const before = siblings[at]!;
      const prev = siblings[at - 1];
      sortOrder = prev ? (prev.sortOrder + before.sortOrder) / 2 : before.sortOrder - 1;
    } else {
      // No `beforeId` is "last among the new siblings" — for a page that
      // stays under its parent too, so the tree's Move to… → Last works.
      const last = siblings[siblings.length - 1];
      sortOrder = last ? Math.max(last.sortOrder + 1, current.sortOrder) : current.sortOrder;
    }

    if (delta !== 0) {
      for (const p of all) {
        if (p.id !== pageId && subtree.has(p.id)) {
          await tx.update(wikiPages).set({ depth: p.depth + delta }).where(eq(wikiPages.id, p.id));
        }
      }
    }
    const [moved] = await tx.update(wikiPages)
      .set({ parentId, depth: current.depth + delta, sortOrder })
      .where(eq(wikiPages.id, pageId)).returning();
    await touchWiki(tx, wiki.id, new Date());
    return pageOf(moved!);
  });
}

/** Archives the page and every active page below it at one instant, so a restore brings them back together. */
export async function archiveWikiPage(userId: string, pageId: string): Promise<void> {
  const { wiki } = await requirePage(userId, pageId, 'write');
  await db.transaction(async (tx) => {
    await lockWikiForWrite(tx, wiki.id);
    const all = await tx.select().from(wikiPages).where(eq(wikiPages.wikiId, wiki.id));
    if (!all.some((p) => p.id === pageId && !p.archivedAt)) throw pageNotFound();
    const ids = [...subtreeIds(all, pageId, (p) => !p.archivedAt)];
    const now = new Date();
    await tx.update(wikiPages).set({ archivedAt: now, updatedAt: now, updatedBy: userId })
      .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.archivedAt)));
    await touchWiki(tx, wiki.id, now);
  });
}

/**
 * `{ pageId }`: brings an archived page back with the slug it always had,
 * together with the pages archived with it. Its parent must be active; a
 * page is never restored into a hole.
 */
export async function restoreWikiPage(userId: string, wikiId: string, input: unknown): Promise<WikiPage> {
  const { wiki } = await requireWiki(userId, wikiId, 'write');
  const pageId = input && typeof input === 'object' ? (input as { pageId?: unknown }).pageId : undefined;
  if (typeof pageId !== 'string') throw domainError('E_INVALID_DOC', 'Choose an archived page.');
  if (!isUuid(pageId)) throw pageNotFound();
  return db.transaction(async (tx) => {
    await lockWikiForWrite(tx, wiki.id);
    const all = await tx.select().from(wikiPages).where(eq(wikiPages.wikiId, wiki.id));
    const page = all.find((p) => p.id === pageId && p.archivedAt);
    if (!page) throw domainError('E_NOT_FOUND', 'No such archived page.');
    if (page.parentId && !all.some((p) => p.id === page.parentId && !p.archivedAt)) {
      throw domainError('E_INVALID_DOC', 'Restore the parent first.');
    }
    const at = page.archivedAt!.getTime();
    const ids = subtreeIds(all, pageId, (p) => p.archivedAt?.getTime() === at);
    for (const p of all) {
      if (!ids.has(p.id)) continue;
      await tx.update(wikiPages).set({ archivedAt: null, updatedAt: laterThan(p.updatedAt), updatedBy: userId })
        .where(eq(wikiPages.id, p.id));
    }
    await touchWiki(tx, wiki.id, new Date());
    const [restored] = await tx.select().from(wikiPages).where(eq(wikiPages.id, pageId));
    return pageOf(restored!);
  });
}

export async function wikiPageHistory(
  userId: string,
  pageId: string,
): Promise<Array<{ id: string; content: { body: string }; updatedAt: string; editor: string | null }>> {
  await requirePage(userId, pageId, 'read');
  const rows = await db.select({
    id: wikiRevisions.id, content: wikiRevisions.content, updatedAt: wikiRevisions.updatedAt, editor: users.fullName,
  }).from(wikiRevisions)
    .leftJoin(users, eq(wikiRevisions.editorId, users.id))
    .where(eq(wikiRevisions.pageId, pageId))
    .orderBy(desc(wikiRevisions.updatedAt)).limit(50);
  return rows.map((r) => ({ id: r.id, content: { body: r.content }, updatedAt: r.updatedAt.toISOString(), editor: r.editor }));
}

/* --------------------------------------------------------------- search */

export type WikiSearchHit = {
  pageId: string; slug: string; title: string; wikiId: string; wikiTitle: string; snippet: string; rank: number;
};

const MAX_SEARCH_LIMIT = 20;

/**
 * Pages in `wikiIds` matching `q` (wiki spec §4b): every term must appear in
 * the title or the plain-text search index, Thai-safe because the terms are
 * split on whitespace rather than on word boundaries pg_trgm cannot see for
 * Thai. Every value is bound — `likePattern` only shapes the pattern, it
 * never becomes SQL text. No session logic here: `wikiIds` is taken as
 * given, so the MCP endpoint (Task 10) can pass its own already-resolved set.
 */
export async function searchWikiIds(
  wikiIds: readonly string[],
  q: unknown,
  limit: number,
): Promise<WikiSearchHit[]> {
  const terms = searchTerms(q);
  if (terms.length === 0 || wikiIds.length === 0) return [];
  const cap = Math.max(1, Math.min(Math.trunc(limit) || MAX_SEARCH_LIMIT, MAX_SEARCH_LIMIT));

  const termConditions = terms.map((term) => {
    const pattern = likePattern(term);
    return sql`(${wikiPages.title} ILIKE ${pattern} ESCAPE '\\' OR ${wikiPages.searchText} ILIKE ${pattern} ESCAPE '\\')`;
  });
  const firstPattern = likePattern(terms[0]!);
  const joinedQuery = terms.join(' ');

  const rows = await db.select({
    pageId: wikiPages.id,
    slug: wikiPages.slug,
    title: wikiPages.title,
    wikiId: wikiPages.wikiId,
    wikiTitle: wikis.title,
    searchText: wikiPages.searchText,
    rank: sql<number>`similarity(${wikiPages.searchText}, ${joinedQuery})`,
  })
    .from(wikiPages)
    .innerJoin(wikis, eq(wikis.id, wikiPages.wikiId))
    .where(and(
      inArray(wikiPages.wikiId, [...wikiIds]),
      isNull(wikiPages.archivedAt),
      isNull(wikis.archivedAt),
      ...termConditions,
    ))
    .orderBy(
      desc(sql`${wikiPages.title} ILIKE ${firstPattern} ESCAPE '\\'`),
      desc(sql`similarity(${wikiPages.searchText}, ${joinedQuery})`),
      desc(wikiPages.updatedAt),
    )
    .limit(cap);

  return rows.map((r) => ({
    pageId: r.pageId, slug: r.slug, title: r.title, wikiId: r.wikiId, wikiTitle: r.wikiTitle,
    snippet: searchSnippet(r.searchText, terms), rank: r.rank,
  }));
}

/**
 * Search scoped to one caller's session: every wiki they can see, or just
 * `wikiId` when given — an id they cannot see is the same 404 as any other
 * unseen wiki (spec §8).
 */
export async function searchWikis(
  userId: string,
  q: unknown,
  wikiId?: string,
  limit = MAX_SEARCH_LIMIT,
): Promise<WikiSearchHit[]> {
  let ids: string[];
  if (wikiId !== undefined) {
    await requireWiki(userId, wikiId, 'read');
    ids = [wikiId];
  } else {
    ids = [...(await visibleWikiIds(userId))];
  }
  return searchWikiIds(ids, q, limit);
}
