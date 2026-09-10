import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  fieldDefinitions, nodes, notifications, projectMembers, projects, users,
} from '@/db/schema';
import { assignmentsAdded, describeAssignment, type PeopleField } from '@/lib/notification-rules';
import type { CustomValues } from '@/db/schema';

/**
 * The read and write adapter for the bell (spec 11).
 *
 * The decisions live in `notification-rules.ts`; this module loads rows, calls
 * them, and persists the answer.
 *
 * **The one thing to be careful about here is the read, not the write.** A
 * notification row outlives the reach of the person it was written for: they
 * can be removed from the project, the project can be archived, the task can
 * be archived. `permissions.ts` rule 1 says a non-member must not be able to
 * learn that a project exists — a bell still listing the names of tasks on a
 * project you were removed from is that leak, spelled out on screen. So every
 * read joins membership rather than trusting the stored `project_id`, and the
 * rows are filtered, never deleted: losing access is not the same as the event
 * not having happened, and a restore brings them straight back.
 */

export type NotificationRow = {
  id: string;
  /** The sentence, already assembled — see `describeAssignment`. */
  text: string;
  actorName: string | null;
  fieldName: string;
  nodeId: string;
  nodeName: string;
  projectName: string;
  /** Where following it goes: the List, scrolled to that row. */
  href: string;
  createdAt: string;
  read: boolean;
};

/* ================================================================= write */

/** Just enough of a Drizzle transaction for what this module does inside one. */
type Tx = Pick<typeof db, 'select' | 'insert'>;

/**
 * Record whatever this write just told somebody, inside the caller's
 * transaction.
 *
 * Called by `updateNode` and nowhere else, because that is the only path a
 * people field can change through. Deliberately *not* a database trigger: the
 * rule is TypeScript's (CLAUDE.md § No triggers), and a trigger would also
 * fire for `clickup-load.mjs`, which writes `node_custom_values` with raw SQL
 * and would hand every migrated project's members several hundred
 * notifications for work that predates the app.
 */
export async function recordAssignments(
  tx: Tx,
  input: {
    nodeId: string;
    projectId: string;
    actorId: string | null;
    before: CustomValues;
    after: CustomValues;
  },
): Promise<void> {
  const defs = await tx
    .select({ id: fieldDefinitions.id, name: fieldDefinitions.name })
    .from(fieldDefinitions)
    .where(and(
      eq(fieldDefinitions.projectId, input.projectId),
      eq(fieldDefinitions.kind, 'people'),
    ));

  const added = assignmentsAdded(
    input.before, input.after, defs as PeopleField[], input.actorId,
  );
  if (added.length === 0) return;

  /*
   * Only people who can actually open the project. A people field stores bare
   * ids with no foreign key (D-32), so it can name somebody who was removed
   * from the project — or never on it, on data that came from ClickUp. A
   * notification they could not follow is not worth writing, and writing it
   * would tell them a project they cannot see exists.
   */
  const recipients = new Set(added.map((a) => a.recipientId));
  const allowed = new Set(
    (await tx
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, input.projectId),
        inArray(projectMembers.userId, [...recipients]),
      ))
    ).map((m) => m.userId),
  );

  const rows = added
    .filter((a) => allowed.has(a.recipientId))
    .map((a) => ({
      userId: a.recipientId,
      actorId: input.actorId,
      projectId: input.projectId,
      nodeId: input.nodeId,
      fieldId: a.fieldId,
      fieldName: a.fieldName,
    }));

  if (rows.length) await tx.insert(notifications).values(rows);
}

/* ================================================================== read */

/**
 * The join every read shares.
 *
 * Membership, project and node are all checked here rather than at the call
 * sites, so a new reader cannot forget one of them and quietly publish a
 * project's task names to somebody who was removed from it last month.
 */
function reachable(userId: string) {
  return and(
    eq(notifications.userId, userId),
    // Still a member — the stored project id is not authority for this.
    isNull(projects.archivedAt),
    // Archived work is off the shelf, so it is off the bell too (spec 11 §3):
    // the count is meant to be work you have not gone and looked at, and there
    // is nothing to go and look at.
    isNull(nodes.archivedAt),
  );
}

const READ_JOIN = (userId: string) => db
  .select({
    id: notifications.id,
    fieldName: notifications.fieldName,
    createdAt: notifications.createdAt,
    readAt: notifications.readAt,
    nodeId: nodes.id,
    nodeName: nodes.name,
    projectName: projects.name,
    slug: projects.slug,
    actorName: users.fullName,
  })
  .from(notifications)
  .innerJoin(nodes, eq(nodes.id, notifications.nodeId))
  .innerJoin(projects, eq(projects.id, notifications.projectId))
  .innerJoin(projectMembers, and(
    eq(projectMembers.projectId, notifications.projectId),
    eq(projectMembers.userId, userId),
  ))
  .leftJoin(users, eq(users.id, notifications.actorId))
  .where(reachable(userId));

/**
 * The bell's contents, newest first.
 *
 * Capped rather than paged. The log grows by one row per assignment and this
 * install's largest project holds 174 tasks, so a reader who has scrolled past
 * fifty is not looking for a notification any more — they are looking for a
 * task, and the List is the tool for that.
 */
export async function loadNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const rows = await READ_JOIN(userId).orderBy(desc(notifications.createdAt)).limit(limit);

  return rows.map((r) => ({
    id: r.id,
    text: describeAssignment(r.actorName, r.fieldName, r.nodeName),
    actorName: r.actorName,
    fieldName: r.fieldName,
    nodeId: r.nodeId,
    nodeName: r.nodeName,
    projectName: r.projectName,
    href: `/p/${r.slug}?node=${r.nodeId}`,
    createdAt: r.createdAt.toISOString(),
    read: r.readAt !== null,
  }));
}

/** What the badge shows. The same filtering, counted rather than listed. */
export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .innerJoin(nodes, eq(nodes.id, notifications.nodeId))
    .innerJoin(projects, eq(projects.id, notifications.projectId))
    .innerJoin(projectMembers, and(
      eq(projectMembers.projectId, notifications.projectId),
      eq(projectMembers.userId, userId),
    ))
    .where(and(reachable(userId), isNull(notifications.readAt)));

  return row?.n ?? 0;
}

/**
 * Mark one read.
 *
 * Scoped by `userId` in the WHERE rather than checked first: a request naming
 * somebody else's notification id matches nothing and changes nothing, and
 * gets the same answer as an id that does not exist — so the endpoint cannot
 * be used to find out whether an id is real.
 */
export async function markRead(userId: string, id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(notifications.id, id),
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    ));
}

/** Clear the badge without following anything. */
export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
