import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { projectMembers, projects, users } from '@/db/schema';
import type { Role } from '@/lib/admin-rules';

/**
 * The access board (spec 05 §2).
 *
 * Project Settings answers "who is on this project". This answers the other
 * half of the same question — "what can this person reach" — which was until
 * now only answerable by opening every project's settings in turn and holding
 * the answer in your head.
 *
 * Two things this module is careful about, both of them consequences of the
 * rule that **there is no workspace-wide superuser**:
 *
 *   - the board is scoped to the projects the acting user administers. It is
 *     not "all projects"; a person who admins one project out of five sees one
 *     column, and the other four are not merely read-only here, they are
 *     absent. Anything else would invent the superuser the spec refuses.
 *   - it therefore grants nothing on its own. Every change it offers goes
 *     through `POST/DELETE /api/projects/:id/members`, which runs the same
 *     `authorize(..., 'member.manage')` check as the settings page. The board
 *     decides what to *draw*; the server still decides what is allowed.
 */

export type PersonAccess = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  /** True until the setup token is claimed — the account cannot sign in yet. */
  pending: boolean;
  /** projectId → role. A project absent from this map means no access at all. */
  roles: Record<string, Role>;
};

export type AccessBoard = {
  /** Only the projects the acting user is an admin of. */
  projects: { id: string; name: string; slug: string }[];
  people: PersonAccess[];
};

export async function loadAccessBoard(actingUserId: string): Promise<AccessBoard> {
  const administered = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(
      eq(projectMembers.userId, actingUserId),
      eq(projectMembers.role, 'admin'),
      // An archived project is off the shelf, so it is not a column here
      // either — there is no reason to grant access to something nobody can
      // open.
      isNull(projects.archivedAt),
    ))
    .orderBy(asc(projects.name));

  if (administered.length === 0) return { projects: [], people: [] };

  const ids = administered.map((p) => p.id);

  const [everyone, grants] = await Promise.all([
    /*
     * Every account, not only the ones already on these projects — you cannot
     * grant access to somebody the page will not show you. This matches what
     * project Settings already exposes in its "Add someone…" list, so it opens
     * nothing that was closed before. It is a real disclosure all the same
     * (names and addresses of everyone on the install) and it is recorded here
     * rather than left to be discovered.
     */
    db.select({
      id: users.id,
      name: users.fullName,
      email: users.email,
      active: users.isActive,
      passwordHash: users.passwordHash,
    }).from(users).orderBy(asc(users.fullName)),

    db.select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
    }).from(projectMembers).where(inArray(projectMembers.projectId, ids)),
  ]);

  const byUser = new Map<string, Record<string, Role>>();
  for (const g of grants) {
    const row = byUser.get(g.userId) ?? {};
    row[g.projectId] = g.role as Role;
    byUser.set(g.userId, row);
  }

  return {
    projects: administered,
    people: everyone.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      active: u.active,
      pending: u.passwordHash === null,
      roles: byUser.get(u.id) ?? {},
    })),
  };
}
