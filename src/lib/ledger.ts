import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, rawQuery } from '@/db/client';
import { fieldDefinitions, fieldOptions, holidays, projects, users } from '@/db/schema';
import type { LedgerRow } from '@/db/schema';
import { requireProjectRole, type Role } from '@/lib/permissions';
import { domainError } from '@/lib/errors';

/**
 * The single read the List and Timeline views share.
 *
 * One call to pmf_project_ledger returns every node with its own dates,
 * durations, misclosure, and its descendants' roll-up. Field definitions and
 * options come from separate queries because they change rarely and nodes
 * change constantly.
 */

export type FieldDef = {
  id: string;
  name: string;
  kind: string;
  position: number;
  settings: { currency?: string; precision?: number; rows?: number; multiple?: boolean };
  archived: boolean;
  options: { id: string; label: string; colorIndex: number; stage: string | null; archived: boolean }[];
};

export type Person = { id: string; name: string };

export type Ledger = {
  project: { id: string; name: string; slug: string; statusFieldId: string | null; columnOrder: string[] };
  role: Role;
  rows: LedgerRow[];
  fields: FieldDef[];
  people: Person[];
  /** Non-working days the Timeline bands behind the run (D-40). */
  holidays: string[];
};

export async function loadLedger(userId: string, slug: string): Promise<Ledger> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      statusFieldId: projects.statusFieldId,
      columnOrder: projects.columnOrder,
    })
    .from(projects)
    .where(and(eq(projects.slug, slug), isNull(projects.archivedAt)))
    .limit(1);

  // A project the user cannot see must be indistinguishable from one that does
  // not exist, so this 404s before the membership check even runs (spec 05 §2).
  if (!project) throw domainError('E_NOT_FOUND', 'No such project.');

  const role = await requireProjectRole(userId, project.id, 'read');

  const [rows, defs, opts, people, hols] = await Promise.all([
    rawQuery<LedgerRow>('SELECT * FROM pmf_project_ledger($1)', [project.id]),
    db
      .select()
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.projectId, project.id))
      .orderBy(asc(fieldDefinitions.position)),
    db
      .select({
        id: fieldOptions.id,
        fieldId: fieldOptions.fieldId,
        label: fieldOptions.label,
        colorIndex: fieldOptions.colorIndex,
        stage: fieldOptions.stage,
        archivedAt: fieldOptions.archivedAt,
        position: fieldOptions.position,
      })
      .from(fieldOptions)
      .orderBy(asc(fieldOptions.position)),
    db.select({ id: users.id, name: users.fullName }).from(users).where(eq(users.isActive, true)),
    db.select({ date: holidays.date }).from(holidays),
  ]);

  const fields: FieldDef[] = defs.map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    position: d.position,
    settings: d.settings ?? {},
    archived: d.archivedAt !== null,
    options: opts
      .filter((o) => o.fieldId === d.id)
      .map((o) => ({
        id: o.id,
        label: o.label,
        colorIndex: o.colorIndex,
        stage: o.stage,
        archived: o.archivedAt !== null,
      })),
  }));

  return { project, role, rows, fields, people, holidays: hols.map((h) => h.date) };
}
