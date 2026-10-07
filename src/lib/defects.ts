import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  projects, fieldDefinitions, fieldOptions, defectSettings,
  defectFieldDefinitions, defectFieldOptions, defectNodes,
} from '@/db/schema';
import { domainError } from '@/lib/errors';

/** Called only after project authorization. Copy once, atomically, even on concurrent first opens. */
export async function ensureDefects(projectId: string): Promise<typeof defectSettings.$inferSelect> {
  const [existing] = await db.select().from(defectSettings).where(eq(defectSettings.id, projectId));
  if (existing) return existing;
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId}, 572))`);
    const [initialized] = await tx.select().from(defectSettings).where(eq(defectSettings.id, projectId));
    if (initialized) return initialized;
    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.archivedAt) throw domainError('E_NOT_FOUND', 'No such project.');
    const defs = await tx.select().from(fieldDefinitions).where(eq(fieldDefinitions.projectId, projectId));
    const opts = await tx.select({ option: fieldOptions }).from(fieldOptions)
      .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, fieldOptions.fieldId))
      .where(eq(fieldDefinitions.projectId, projectId));
    const ids = new Map<string, string>();
    for (const field of defs) {
      const { id, createdAt: _created, updatedAt: _updated, ...definition } = field;
      const [copy] = await tx.insert(defectFieldDefinitions).values(definition).returning({ id: defectFieldDefinitions.id });
      ids.set(id, copy!.id);
    }
    if (opts.length) await tx.insert(defectFieldOptions).values(opts.map(({ option }) => {
      const { id: _id, createdAt: _created, ...copy } = option;
      return { ...copy, fieldId: ids.get(option.fieldId)! };
    }));
    await tx.insert(defectNodes).values({ projectId, depth: 1, name: project.name, sortOrder: 0 });
    const [created] = await tx.insert(defectSettings).values({
      id: projectId,
      statusFieldId: project.statusFieldId ? ids.get(project.statusFieldId) ?? null : null,
      columnOrder: project.columnOrder.map(key => ids.get(key) ?? key),
    }).returning();
    return created!;
  });
}
