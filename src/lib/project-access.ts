import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { projectMembers, projects } from '@/db/schema';
import type { Role } from '@/lib/permissions';

/**
 * Which projects a person can see right now: the ones they are a member of
 * that are not archived (spec 05 §3 — no membership row, no project). This is
 * the project half of a token's `Visible` set, so a token scoped to a project
 * stops reaching it the moment its owner loses membership, and reaches it
 * again the moment membership comes back, with nothing stored to clean up.
 */

export type VisibleProject = { id: string; name: string; slug: string; role: Role };

/** Member, project not archived, by name. */
export async function visibleProjects(userId: string): Promise<VisibleProject[]> {
  return db.select({ id: projects.id, name: projects.name, slug: projects.slug, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.archivedAt)))
    .orderBy(projects.name, projects.id);
}

export async function visibleProjectIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: projects.id })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.archivedAt)));
  return new Set(rows.map((r) => r.id));
}
